/**
 * GraphData 唯一事实源与所有图修改的唯一合法入口（模块级单例）。
 *
 * @remarks
 * 持有当前视图图 / 路径 / 操作日志，协调多图注册表与 localStorage 持久化。
 * 留在本 store 的判定标准（四入口）：
 * 唯一切换（loadGraphToView）∨ 唯一图操作（commitBatchToGraphs）∨ 唯一回溯（undo / redo）。
 * 生命周期管理（恢复 / 创建根图）与校验清理已下沉至用例层（useLifecycle / 操作用例层）。
 *
 * 响应式策略：graphViewId / graphPath / lastValidationResult / graphRegistry 为 shallowReactive
 * 顶层属性（引用替换触发更新）；graphView 为派生 accessor（按 graphViewId 从 graphRegistry 查询）；
 * operationLog / redoStack 为普通字段（raw 无代理），引擎 structuredClone 可直接克隆，
 * 无需 toRaw / markRaw 解包。
 */

import { shallowReactive } from 'vue'

import type { GraphData, GraphId } from '@my-project/graph-engine'
import type { ValidationResult } from '@my-project/graph-engine'
import type {
    OperationBatch,
    OperationLog,
    OperationLogEntry,
} from '@my-project/graph-engine'

import { applyBatches } from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/graph_registry'
import {
    createRegistry,
    registerGraph,
    lookupGraph,
} from '@/graph/graph_registry'

import {
    saveGraph,
    loadGraph,
    saveLastActiveRootId,
} from '@/graph/graph_persistence'

import { revertAddGraph, revertDeleteGraph } from '@/graph/graph_signals'

import {
    DATA_INTEGRITY_PREFIX,
    reportCorruptedGraph,
    reportMissingGraph,
} from '@/graph/utils/data_integrity_reporter'

import {
    isInGraphOperation,
    isGraphLevelOperation,
} from '@/graph/utils/operation_guards'

/**
 * GraphStore 公开 API：状态 + 方法入口。
 *
 * @remarks
 * 状态按职责分组：
 * - 视图态（响应式）：graphViewId / graphPath / lastValidationResult（graphView 为派生 accessor）
 * - 多图注册表（响应式，引用替换）：graphRegistry
 * - 撤销日志（普通字段）：operationLog / redoStack
 */
export interface GraphStoreAPI {
    // 视图态（响应式，引用替换触发更新）
    graphViewId: GraphId | null

    // 只读，不可赋值
    readonly graphView: GraphData | null
    graphPath: GraphId[]
    lastValidationResult: ValidationResult | null

    // 多图注册表（响应式，引用替换触发更新；Map 本身保持 raw）
    graphRegistry: GraphRegistry

    // 撤销日志（普通字段，raw 无代理）
    operationLog: OperationLog
    redoStack: number[]

    // 唯一切换
    loadGraphToView(graphId: GraphId): boolean

    // 功能行为
    commitBatchToGraphs(
        operationBatch: OperationBatch[],
        options?: {
            recordLog?: boolean
            skipValidate?: boolean
            source?: string
        },
    ): { validation: ValidationResult }
    undo(): boolean
    redo(): boolean
}

let singleton: GraphStoreAPI | null = null

/**
 * 获取 GraphStore 模块级单例（懒创建）。
 *
 * @remarks
 * 后续调用返回同一实例；测试经 {@link resetGraphStoreForTests} 重建。
 */
export function useGraphStore(): GraphStoreAPI {
    if (!singleton) {
        singleton = createGraphStore()
    }
    return singleton
}

/**
 * 重建 GraphStore 单例，供测试隔离使用（替代原 setActivePinia(createPinia())）。
 */
export function resetGraphStoreForTests(): void {
    singleton = null
}

function createGraphStore(): GraphStoreAPI {
    // 嵌套对象（GraphData / 数组 / Map）保持 raw——引擎 structuredClone 可安全克隆
    let store: GraphStoreAPI = shallowReactive({
        // ── 响应式状态：顶层属性替换触发更新（Graph.vue watch / 导航 computed 消费）──
        graphViewId: null as GraphId | null,
        graphPath: [] as GraphId[],
        lastValidationResult: null as ValidationResult | null,

        // 派生 accessor：graphView 不单独持有，按 graphViewId 从 graphRegistry 查询。
        // getter 读取两个顶层属性，watch 依赖自动建立——任一变化触发重新求值。
        // graphRegistry 依赖仅在顶层引用替换时建立（Map 原地 set 不触发）
        get graphView(): GraphData | null {
            return this.graphViewId
                ? (this.graphRegistry.get(this.graphViewId) ?? null)
                : null
        },

        // 多图注册表：承接 applyBatches 返回的新注册表做引用替换
        // （shallowReactive 不深代理，Map 与 GraphData 保持 raw，引擎克隆路径不受影响）
        graphRegistry: createRegistry(),

        // —— 语义上非响应式状态（raw 无代理，引擎 structuredClone 可直接克隆）——
        operationLog: { entries: [], cursor: -1 } as OperationLog,
        redoStack: [] as number[],

        // ── 方法（函数不被代理，原样保留）──
        loadGraphToView,
        commitBatchToGraphs,
        undo,
        redo,
    })

    /**
     * 用户切换图谱的唯一入口：从持久化加载图谱并设为当前视图。
     *
     * @remarks
     * 本函数不负责完整图校验。操作日志生命周期跟随工作根图谱：仅当切换到不同根图树时
     * 重置 operationLog 与 redoStack；同根图树内导航（子图↔根图）不清空。
     *
     * 错误出口：
     * 1. missing（图不存在）→ 静默返回 false，不写任何状态（正常状态，UI 兜底逻辑不变）
     * 2. corrupted（图损坏）→ 走开发者通道（console.warn）后返回 false，不写 lastValidationResult
     * 3. 祖先链断裂 / 环 → 由 buildGraphPath 回溯时走开发者通道（console.warn），图本身加载成功返回 true
     *
     * @param graphId - 目标图谱 ID
     * @returns 加载成功 true；图不存在或损坏 false。
     */
    function loadGraphToView(graphId: GraphId): boolean {
        const loadedResult = loadGraph(graphId)
        if (!loadedResult.ok) {
            // missing（图不存在）为正常状态，静默；corrupted（图损坏）为系统异常，入开发者通道
            if (loadedResult.reason === 'corrupted') {
                reportCorruptedGraph(graphId, '已跳过加载')
            }
            return false
        }

        // 先注册后设 id：派生图数据 getter 在任意时刻（含同步读）都能查到图
        registerGraph(store.graphRegistry, loadedResult.graph)
        store.graphViewId = loadedResult.graph.id

        // 操作日志的生命周期：根图谱 = 日志——仅当切换到不同根图树时重置操作日志与 redo 栈。
        // 同根图树内导航（子图↔根图）不清空。
        // previousRootId 必须在覆盖 graphPath 之前读取
        const previousRootId = store.graphPath[0]
        const { path, terminal } = buildGraphPath(loadedResult.graph)
        store.graphPath = path
        if (
            path.length > 0 &&
            previousRootId !== undefined &&
            previousRootId !== path[0]
        ) {
            store.operationLog = { entries: [], cursor: -1 }
            store.redoStack = []
        }

        // 祖先链断裂 / 环的检测与开发者通道记录在 buildGraphPath 回溯过程中完成，
        // 此处不再重复报告（否则同一异常会产出两条相同 console.warn）
        // 记录最后活跃的根图 ID：下次启动时 useLifecycle.restoreLastRootTree 据此恢复工作根图树
        if (terminal.kind === 'root') {
            saveLastActiveRootId(terminal.id)
        }

        // 切换图谱：旧图的校验结果（错误提示）不再适用于新视图，一并清空
        store.lastValidationResult = null

        return true
    }

    /**
     * 对多个目标图批量执行操作，是全部图写入的统一入口。
     *
     * @remarks
     * 直接委托引擎 {@link applyBatches}：统一循环执行图内（applyBatch）与图级
     * （add_graph / delete_graph 兑现）操作，返回新注册表 + 聚合校验 + 逆元序列 + graphSignals。
     *
     * 成功后处理链：
     * 1. 引用替换注册表（store.graphRegistry = result.registry，触发响应式）
     * 2. 持久化批内涉及的图（inGraph 批目标图 + graphLevel 批 add_graph 的图，取新注册表最新数据）
     * 3. 日志组装（operation + 图内逆元 + graphSignals，recordLog !== false 时）
     *
     * graphView 为派生 accessor：注册表引用替换后自动指向新图，无需手动同步。
     *
     * 调用契约：
     * 1. 任一操作校验失败整批丢弃，注册表不变（applyBatches 事务性）
     * 2. 图内批目标图必须在注册表中（applyBatches 校验 BATCH_GRAPH_NOT_FOUND）
     * 3. options.recordLog 默认 true；false（undo/redo 执行）不追加 entry、不动 cursor、不清 redoStack
     *
     * @param operationBatch - 多批次操作（图内 / 图级判别联合）
     * @param options - [可选] recordLog：是否写入操作日志（默认 true）；
     *                  skipValidate：透传引擎 applyBatches，跳过 Phase 1 前提校验
     *                  （undo/redo 恢复型逆元批传 true，正向用户操作默认 false）；
     *                  source：操作来源的工具标识，透传写入 entry.source
     *                  （缺省 undefined = 未知来源，供操作日志树 UI 按来源分类）
     * @returns 校验结果（valid + issues 汇总）。
     */
    function commitBatchToGraphs(
        operationBatch: OperationBatch[],
        options?: {
            recordLog?: boolean
            skipValidate?: boolean
            source?: string
        },
    ): { validation: ValidationResult } {
        // 委托引擎 applyBatches：统一循环执行图内（applyBatch）与图级（add_graph / delete_graph 兑现）操作
        const result = applyBatches(store.graphRegistry, operationBatch, {
            skipValidate: options?.skipValidate, // 由 undo/redo传入，以跳过校验
            recordLog: options?.recordLog !== false, // undo/redo 执行时不收集逆元（日志已有）
        })

        if (!result.validation.valid) {
            store.lastValidationResult = result.validation
            return { validation: result.validation }
        }

        // 引用替换注册表（applyBatches 返回新 Map，复用未变化图引用，不深拷贝）
        store.graphRegistry = result.registry

        // 批内涉及的图 id：持久化范围推导。
        const affectedGraphIds = new Set<GraphId>()
        for (const batch of operationBatch) {
            if (batch.kind === 'inGraph') {
                affectedGraphIds.add(batch.graph.id)
            } else {
                for (const op of batch.operations) {
                    // 从新注册表取图时，被 delete_graph 注销的图不存在（undefined）→ 自动跳过持久化，
                    // 软删保留旧数据——无需按操作类型特判。
                    affectedGraphIds.add(op.graph.id)
                }
            }
        }

        // 持久化批内涉及的图（从新注册表取最新数据；被注销的 delete_graph 目标图自然跳过）
        for (const graphId of affectedGraphIds) {
            const graph = result.registry.get(graphId)
            if (graph) saveGraph(graph)
        }

        // 操作日志写入（正逆操作双存模型）
        // 整批成功后组装 entry 追加、cursor 前进、清空 redoStack
        if (options?.recordLog !== false && operationBatch.length > 0) {
            const entry: OperationLogEntry = {
                operation: operationBatch.map((batch) =>
                    batch.kind === 'inGraph'
                        ? {
                              graphId: batch.graph.id,
                              operations: batch.operations,
                          }
                        : {
                              // graphLevel 批：graphId 取首个操作的图 id（add_graph / delete_graph 均携带图数据）
                              graphId: batch.operations[0]?.graph.id ?? '',
                              operations: batch.operations,
                          },
                ),
                // 图级逆元（add_graph ↔ delete_graph）由 graphSignals + 三段式 undo 兑现，
                // 不进入 reversalOperations（保持现状日志结构；07 统一日志模型时再启用）
                reversalOperations: result.reversalOperations.filter(
                    (item) =>
                        !item.operations.some(
                            (op) =>
                                op.type === 'add_graph' ||
                                op.type === 'delete_graph',
                        ),
                ),
                graphSignals: result.graphSignals,
                parentIndex: store.operationLog.cursor,
                timestamp: new Date().toISOString(),
                source: options?.source, // 来源工具标识，缺省 undefined = 未知来源
            }

            store.operationLog.entries.push(entry)
            store.operationLog.cursor = store.operationLog.entries.length - 1
            store.redoStack = [] // 用户新操作使 redo 失效
        }

        store.lastValidationResult = result.validation

        return { validation: result.validation }
    }

    /**
     * 撤销最近一次操作。
     *
     * @remarks
     * 对当前 cursor 指向的 entry 执行逆元，成功后游标回退到 parentIndex
     * 并把 entry 索引推入 redoStack。
     *
     * @returns 存在可撤销历史且撤销成功 true；无历史或逆元执行失败（防御，正常不可达）false。
     */
    function undo(): boolean {
        if (store.operationLog.cursor < 0) {
            return false
        }

        const entryIndex = store.operationLog.cursor

        if (applyEntry(entryIndex, 'reverse')) {
            store.redoStack.push(entryIndex)
            ensureViewConsistency()
            return true
        }

        return false
    }

    /**
     * 重做最近一次撤销（日志驱动）。
     *
     * @remarks
     * 从 redoStack 弹出 entry 索引并正向执行，游标移动在 applyEntry 内完成。
     *
     * @returns 存在可重做历史且重做成功 true；无历史或执行失败（防御，正常不可达）false。
     */
    function redo(): boolean {
        const entryIndex = store.redoStack.pop()

        if (entryIndex === undefined) {
            return false
        }

        if (applyEntry(entryIndex, 'forward')) {
            ensureViewConsistency()
            return true
        }

        // 防御：applyEntry 失败（正常不可达）时回滚已弹出的索引，避免 redo 指针丢失
        store.redoStack.push(entryIndex)
        return false
    }

    /**
     * undo / redo 共用执行原语：对指定 entry 按方向执行。
     *
     * @remarks
     * reverse（undo）走三段式（1. deleted 恢复 → 2. 图内逆元 → 3. added 注销）；
     * forward（redo）重走正向操作。实际执行委托 {@link commitBatchToGraphs}
     * （recordLog: false）与 graph_signals，本函数只做顺序编排与游标移动。
     *
     * 统一对称的撤销模型：
     * - undo = 逆序执行 entry 的全部逆元；
     * - redo = 正序执行 entry 的全部操作。
     *
     * 图内与图级以各自形态参与同一序列：
     * - 图内逆元：操作对象（createReversal 精确反转）
     * - 图级逆元：兑现逻辑
     *   - add_graph 的逆元：整体注销（内容随图消失，不单独动数据）
     *   - delete_graph 的逆元：从持久化完整恢复注册
     *
     * 三段式（1 → 2 → 3）即该逆元序列的代码化，顺序由执行依赖决定：
     * 1. deleted 恢复 —— 最先（图内逆元执行前目标图需在 registry）
     * 2. 图内逆元   —— 居中
     * 3. added 注销 —— 最后（正向批首新建的图，撤销放末尾）
     *
     * 第 2 步跳过 added 图逆元是"add_graph 逆元 = 整体注销"的自然结果——
     * 撤销建图 = 原子整体消失，图内内容随图消失。
     *
     * 游标副作用：
     * - reverse 成功 → cursor = parentIndex（树形分支下 ≠ cursor - 1）
     * - forward 成功 → cursor = entryIndex
     * - 失败不移动
     *
     * @param entryIndex - 操作日志 entry 索引
     * @param direction - 'forward'（redo）或 'reverse'（undo）
     * @returns 执行成功 true；entry 不存在或图内校验失败（防御，正常不可达）→ false。
     */
    function applyEntry(
        entryIndex: number,
        direction: 'forward' | 'reverse',
    ): boolean {
        const entry = store.operationLog.entries[entryIndex]

        if (!entry) {
            return false
        }

        if (direction === 'reverse') {
            // 阶段一：图级恢复（deleted 逆序）：撤销 delete_graph，从持久化恢复注册
            // 因为操作日志不记录 delete_graph 的位置
            for (const graphId of [...entry.graphSignals.deleted].reverse()) {
                revertDeleteGraph(store.graphRegistry, graphId)
            }

            // 阶段二：图内逆元执行（reversalOperations 顺序遍历，组装时已逆序）。
            // 跳过 added 图的 item：③ 注销后其逆元无意义，且执行会把空壳中间态写回
            // 持久化，覆盖正向批的填充版（数据丢失）。
            const addedGraphIds = new Set(entry.graphSignals.added)
            const batch: OperationBatch[] = []
            for (const reversalItem of entry.reversalOperations) {
                if (reversalItem.operations.length === 0) continue
                if (addedGraphIds.has(reversalItem.graphId)) continue // 跳过 added 图的 item：模型本质要求（见JSDoc）

                const graph = lookupGraph(
                    store.graphRegistry,
                    reversalItem.graphId,
                )
                if (!graph) {
                    reportRegistryResolveFailure(
                        reversalItem.graphId,
                        'undo 逆元执行',
                    ) // 正常不可达：跳过
                    continue
                }

                batch.push({
                    kind: 'inGraph',
                    graph,
                    // 组装时已过滤图级逆元，此处收窄类型（运行时恒为图内操作）
                    operations:
                        reversalItem.operations.filter(isInGraphOperation),
                })
            }

            if (batch.length > 0) {
                // skipValidate: 恢复型逆元批的前提依赖批内顺序，静态校验必然误报
                const result = commitBatchToGraphs(batch, {
                    recordLog: false,
                    skipValidate: true,
                })

                if (result.validation.valid === false) {
                    reportReversalApplyFailure(entryIndex, 'undo') // 防御：正常不可达
                    return false
                }
            }

            // 阶段三：图级消失（added 逆序）：撤销 add_graph
            for (const graphId of [...entry.graphSignals.added].reverse()) {
                revertAddGraph(store.graphRegistry, graphId)
            }

            store.operationLog.cursor = entry.parentIndex
            return true
        } else if (direction === 'forward') {
            // forward（redo）：operation 顺序遍历组装 commitBatchToGraphs 可执行的 batch
            const batch: OperationBatch[] = []
            for (const forwardItem of entry.operation) {
                let graph = lookupGraph(
                    store.graphRegistry,
                    forwardItem.graphId,
                )

                if (!graph) {
                    // registry 缺失（undo 注销的 added 图）→ 用批内 add_graph.graph 兜底
                    // （跨 item 查找：add_graph 批与填充批在 entry.operation 中可能分离）
                    const addGraphOp = entry.operation
                        .flatMap((item) => item.operations)
                        .find(
                            (op) =>
                                op.type === 'add_graph' &&
                                op.graph.id === forwardItem.graphId,
                        )
                    if (addGraphOp && addGraphOp.type === 'add_graph') {
                        graph = addGraphOp.graph
                    } else {
                        reportRegistryResolveFailure(
                            forwardItem.graphId,
                            'redo 正向执行',
                        )
                        continue
                    }
                }

                // 图级操作与图内操作分拆为独立批（applyBatches 判别联合要求）
                const graphLevelOps = forwardItem.operations.filter(
                    isGraphLevelOperation,
                )
                const inGraphOps =
                    forwardItem.operations.filter(isInGraphOperation)
                if (graphLevelOps.length > 0) {
                    batch.push({
                        kind: 'graphLevel',
                        operations: graphLevelOps,
                    })
                }
                if (inGraphOps.length > 0) {
                    batch.push({
                        kind: 'inGraph',
                        graph,
                        operations: inGraphOps,
                    })
                }
            }

            if (batch.length > 0) {
                // redo 重走已验证操作，跳过校验
                const result = commitBatchToGraphs(batch, {
                    recordLog: false,
                    skipValidate: true,
                })

                if (result.validation.valid === false) {
                    reportReversalApplyFailure(entryIndex, 'redo') // 防御：正常不可达
                    return false
                }
            }

            store.operationLog.cursor = entryIndex
            return true
        }

        // 类型保证不可达（direction 为 'forward' | 'reverse' 联合）；防御兜底
        return false
    }

    /**
     * undo / redo 后的视图一致性检查。
     * 视图图被注销（撤销含 add_graph 的批且正在查看该子图）时，将视图切到最近可达图。
     *
     * @remarks
     * 规则：
     * - graphViewId 为空或视图图仍在 registry → 直接返回（视图有效，无需处理）
     * - 否则按优先级寻找 fallback：
     *   1. 沿 parentGraphId 上溯找最近可达祖先（registry 优先，缺失则从持久化惰性加载注册；
     *      环 / 链断裂 → 停止上溯）
     *   2. 任一 root 图（registry 中 kind === 'root'）
     *   3. 均无 → 清空视图（graphViewId = null，graphPath = []）
     * - 切换后：buildGraphPath 重算 graphPath；末端为 root 时更新 lastActiveRootId
     */
    function ensureViewConsistency(): void {
        const currentViewId = store.graphViewId
        if (!currentViewId) return
        if (store.graphView) return

        // 视图图已被注销（撤销含 add_graph 的批）：派生 graphView 立即为 null，
        // 父链回溯需从持久化取图数据（软删保留数据，正常流程可达）
        const result = loadGraph(currentViewId)
        if (!result.ok) {
            // 数据损坏 / 丢失（正常流程不可达）：入开发者通道，随后走 root 兜底
            if (result.reason === 'corrupted') {
                reportCorruptedGraph(currentViewId, '视图一致性检查')
            } else {
                reportMissingGraph(currentViewId, '视图一致性检查')
            }
        }
        const staleGraph = result.ok ? result.graph : null

        let fallback: GraphData | null = null
        let cursorGraph = staleGraph
        const visited = new Set<GraphId>(staleGraph ? [staleGraph.id] : [])

        while (cursorGraph && cursorGraph.parentGraphId) {
            const parentId = cursorGraph.parentGraphId

            if (visited.has(parentId)) break // 环防御
            visited.add(parentId)

            const parent = findParentGraph(store.graphRegistry, parentId)
            if (!parent) {
                // 数据损坏：被注销图的父图在 registry 与持久化均不可达（正常流程软删保留数据），
                // 开发者通道报告后走 root 兜底
                reportBrokenAncestorChain(
                    currentViewId,
                    cursorGraph.id,
                    parentId,
                )
                break
            }

            fallback = parent
            break // 找到最近可达祖先
        }

        if (!fallback) {
            for (const graph of store.graphRegistry.values()) {
                if (graph.kind === 'root') {
                    fallback = graph
                    break
                }
            }
        }

        if (!fallback) {
            // 注册表全空：视图清空（graphViewId 为 null，graphPath 为空）
            store.graphViewId = null
            store.graphPath = []
            return
        }

        store.graphViewId = fallback.id
        const { path, terminal } = buildGraphPath(fallback)
        store.graphPath = path

        // 必要时更新最后活跃根图（undo/redo 不改变根图树，防御性更新）
        if (terminal.kind === 'root') {
            saveLastActiveRootId(terminal.id)
        }
    }

    /**
     * 沿 parentGraphId 链回溯，为任意图构建从根图到该图的完整路径（根→叶）。
     *
     * @remarks
     * 回溯途中：祖先图不在 registry 时由 findParentGraph 惰性加载并注册
     * （保证后续引用一致）；链完整性异常（环 / 父图缺失）就地写入开发者通道记录，
     * 并在断裂处停止回溯。
     *
     * 调用契约：
     * 1. 输入图需在 registry 或持久化中可达（祖先链可回溯）
     * 2. 假定图链为树结构（单亲、无环）——环检测防御该假设被破坏
     * 3. 返回 terminal：链末端图（根图或断裂处），调用方据此判断是否到达根
     * 4. 环 / 父缺失的 console.warn 记录在回溯处就地完成，调用方无需重复报告
     *
     * @param graph - 起始图
     * @returns path（根→叶的 ID 序列）与 terminal（链末端图）。
     */
    function buildGraphPath(graph: GraphData): {
        path: GraphId[]
        terminal: GraphData
    } {
        const path: GraphId[] = [graph.id]
        const visited = new Set<GraphId>([graph.id])
        let currentGraph: GraphData = graph
        while (currentGraph.parentGraphId) {
            const parentId = currentGraph.parentGraphId

            // 环检测：链应构成森林（无环），异常数据成环时防止无限循环
            if (visited.has(parentId)) {
                reportCycleDetected(parentId)
                break
            }
            visited.add(parentId)

            // 父图缺失（registry 与持久化均不可达）：链在此中断，terminal 停在断裂处
            const parent = findParentGraph(store.graphRegistry, parentId)
            if (!parent) {
                reportBrokenAncestorChain(graph.id, currentGraph.id, parentId)
                break
            }

            path.unshift(parentId)
            currentGraph = parent
        }

        return { path, terminal: currentGraph }
    }

    return store
}

// ── 私有辅助（图查找） ──

/**
 * 查找父图：优先取 registry 中的运行时引用（避免反序列化新对象、保持引用一致），
 * 未命中则从持久化惰性加载并注册（保证后续回溯与导航引用同一对象）。
 *
 * @param registry - 图注册表
 * @param parentId - 父图 ID
 * @returns 父图 GraphData；registry 与持久化均不可达时返回 undefined，调用方据此判定链断裂。
 */
function findParentGraph(
    registry: GraphRegistry,
    parentId: GraphId,
): GraphData | undefined {
    const inRegistry = lookupGraph(registry, parentId)
    if (inRegistry) return inRegistry

    const result = loadGraph(parentId)
    if (result.ok) {
        registerGraph(registry, result.graph)
        return result.graph
    }

    return undefined
}

// ── 私有辅助（开发者通道报告） ──

/**
 * 祖先链断裂报告（开发者通道）。沿 parentGraphId 回溯时父图不可达（缺失或损坏）时调用。
 *
 * @param graphId - 发起回溯的图 ID
 * @param terminalId - 链断裂处（最后成功回溯到的图 ID）
 * @param missingParentId - 缺失的父图 ID
 */
function reportBrokenAncestorChain(
    graphId: GraphId,
    terminalId: GraphId,
    missingParentId: GraphId,
): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [ANCESTOR_CHAIN_BROKEN] 图谱 "${graphId}" 的父链在 "${terminalId}" 处中断：祖先图谱 "${missingParentId}" 不可达`,
    )
}

/**
 * 环检测报告（开发者通道）。parentGraphId 链检测到环、回溯被迫中断时调用。
 *
 * @param parentId - 导致回退的重复父图 ID（环的入口）
 */
function reportCycleDetected(parentId: GraphId): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [CYCLE_DETECTED] parentGraphId 链检测到环：图谱 "${parentId}" 被重复访问，已中断回溯`,
    )
}

/**
 * applyEntry 组装 batch 时 registry 解析失败报告（开发者通道）。
 * 正常流程不可达（undo 的图在 registry 中、redo 的图有 add_graph 兜底），防御性处理。
 *
 * @param graphId - 解析失败的图 ID
 * @param context - 发生场景（'undo 逆元执行' / 'redo 正向执行'）
 */
function reportRegistryResolveFailure(graphId: GraphId, context: string): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [REGISTRY_RESOLVE_FAILED] ${context}：图谱 "${graphId}" 不在注册表且无兜底，已跳过该 item`,
    )
}

/**
 * applyEntry 逆元执行校验失败报告（开发者通道）。
 * 正常流程不可达（逆元目标存在由 validate 保证），防御性处理。
 *
 * @param entryIndex - 失败的日志 entry 索引
 * @param direction - 'undo' 或 'redo'
 */
function reportReversalApplyFailure(
    entryIndex: number,
    direction: 'undo' | 'redo',
): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [REVERSAL_APPLY_FAILED] ${direction} 执行 entry #${entryIndex} 时校验失败（正常流程不可达），已中断`,
    )
}
