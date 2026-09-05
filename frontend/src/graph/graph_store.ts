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
    BatchesLog,
    OperationBatch,
    OperationLogTree,
    CommitLog,
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
    deleteGraph,
    saveLastActiveRootId,
} from '@/graph/graph_persistence'

import {
    DATA_INTEGRITY_PREFIX,
    reportCorruptedGraph,
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
    operationLog: OperationLogTree
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
            executedAt?: string
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

        // 派生 accessor：graphView 按 graphViewId 从 graphRegistry 查询。
        // getter 读取两个顶层属性，watch 依赖自动建立——任一变化触发重新求值。
        // graphRegistry 依赖仅在顶层引用替换时建立（Map 原地 set 不触发）
        get graphView(): GraphData | null {
            if (!this.graphViewId) return null
            return this.graphRegistry.get(this.graphViewId) ?? null
        },

        // 多图注册表：承接 applyBatches 返回的新注册表做引用替换
        // （shallowReactive 不深代理，Map 与 GraphData 保持 raw，引擎克隆路径不受影响）
        graphRegistry: createRegistry(),

        // —— 语义上非响应式状态（raw 无代理，引擎 structuredClone 可直接克隆）——
        operationLog: { entries: [], cursor: -1 } as OperationLogTree,
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
     * 本函数不负责完整图校验。
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
            // missing（图不存在）为正常状态，静默；corrupted（图损坏）为系统异常，走开发者通道
            if (loadedResult.reason === 'corrupted') {
                reportCorruptedGraph(graphId, '已跳过加载')
            }
            return false
        }

        // 图已在注册表全量注册，仅切换视图
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
        // 记录最后活跃的根图 ID：下次启动时 useLifecycle.restoreLastActiveRootId 据此恢复上次视图
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
     * （add_graph / delete_graph 兑现）操作，返回新注册表 + 聚合校验 + 逆元序列。
     *
     * 成功后处理链：
     * 1. 引用替换注册表（store.graphRegistry = result.registry，触发响应式）
     * 2. 持久化批内涉及的图（跟随注册表生命周期：有则 saveGraph、无则 deleteGraph 真删）
     * 3. 日志组装（operation + 逆元全量，recordLog !== false 时）
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
     *                  source：操作来源的工具标识
     *                  （缺省 undefined = 未知来源，供操作日志树 UI 按来源分类）；
     *                  executedAt：时间戳来源（缺省内部生成当前时刻）
     * @returns 校验结果（valid + issues 汇总）。
     */
    function commitBatchToGraphs(
        operationBatch: OperationBatch[],
        options?: {
            recordLog?: boolean
            skipValidate?: boolean
            source?: string
            executedAt?: string
        },
    ): { validation: ValidationResult } {
        // 时间源：缺省时内部生成当前时刻（前端即 Runtime，是合法的时间源）
        const executedAt = options?.executedAt ?? new Date().toISOString()

        // P!委托引擎 applyBatches：统一循环执行图内（applyBatch）与图级（add_graph / delete_graph 兑现）操作
        const result = applyBatches(store.graphRegistry, operationBatch, {
            executedAt,
            skipValidate: options?.skipValidate, // 由 undo/redo传入，以跳过校验
            recordLog: options?.recordLog !== false, // undo/redo 执行时不收集逆元（日志已有）
        })

        if (!result.validation.valid) {
            store.lastValidationResult = result.validation
            return { validation: result.validation }
        }
        // 引用替换注册表（applyBatches 返回新 Map，复用未变化图引用，不深拷贝）
        store.graphRegistry = result.registry
        store.lastValidationResult = result.validation

        // 批内涉及的图 id：持久化范围推导。
        const affectedGraphIds = new Set<GraphId>()
        for (const batch of operationBatch) {
            if (batch.kind === 'inGraph') {
                affectedGraphIds.add(batch.graph.id)
            } else if (batch.kind === 'graphLevel') {
                for (const op of batch.operations) {
                    // 被 delete_graph 注销的图在新注册表不存在 → 下方 deleteGraph 真删
                    affectedGraphIds.add(op.graph.id)
                }
            }
        }
        // 持久化跟随注册表生命周期：有则保存（含 undo 逆元重建的图）、无则真删（delete_graph 注销）
        for (const graphId of affectedGraphIds) {
            const graph = result.registry.get(graphId)
            if (graph) {
                saveGraph(graph)
            } else {
                deleteGraph(graphId)
            }
        }

        // 操作日志写入（正逆操作双存模型）
        // 整批成功后组装 entry 追加、cursor 前进、清空 redoStack
        if (options?.recordLog !== false && operationBatch.length > 0) {
            const entry: CommitLog = {
                batches: operationBatch.map(toBatchesLog),
                // 逆元全量入日志（图内 + 图级）：undo 直接消费 reversalBatches 完整序列
                reversalBatches: result.reversalBatches,
                parentIndex: store.operationLog.cursor,
                // 批级唯一时间：与 applyBatches 的 executedAt 同一值（正逆三路径共用）
                timestamp: executedAt,
                source: options?.source, // 来源工具标识，缺省 undefined = 未知来源
            }

            store.operationLog.entries.push(entry)
            store.operationLog.cursor = store.operationLog.entries.length - 1
            store.redoStack = [] // 用户新操作使 redo 失效
        }

        return { validation: result.validation }
    }

    /**
     * 撤销最近一次操作。
     *
     * @remarks
     * 对当前 cursor 指向的 entry 执行逆元序列（applyLogEntry 'undo'），成功后游标回退到
     * parentIndex 并把 entry 索引推入 redoStack；视图图被注销时切到最近可达图
     * （优先 applyLogEntry 附带提取的父图 hint，否则 root 兜底）。
     *
     * @returns 存在可撤销历史且撤销成功 true；无历史或逆元执行失败（防御，正常不可达）false。
     */
    function undo(): boolean {
        if (store.operationLog.cursor < 0) {
            return false
        }

        const entryIndex = store.operationLog.cursor
        const result = applyLogEntry(entryIndex, 'undo')
        if (result.ok) {
            store.redoStack.push(entryIndex)
            goToNearestAvailableGraph(result.orphanedParentHint)
            return true
        }

        return false
    }

    /**
     * 重做最近一次撤销（日志驱动）。
     *
     * @remarks
     * 从 redoStack 弹出 entry 索引并正向执行（applyLogEntry 'redo'），成功后游标前进到该 entry；
     * 视图图被注销时切到最近可达图（applyLogEntry 附带 hint，redo 下通常为 undefined → root 兜底）。
     *
     * @returns 存在可重做历史且重做成功 true；无历史或执行失败（防御，正常不可达）false。
     */
    function redo(): boolean {
        const entryIndex = store.redoStack.pop()

        if (entryIndex === undefined) {
            return false
        }

        const result = applyLogEntry(entryIndex, 'redo')
        if (result.ok) {
            goToNearestAvailableGraph(result.orphanedParentHint)
            return true
        }

        // 防御：applyLogEntry 失败（正常不可达）时回滚已弹出的索引，避免 redo 指针丢失
        store.redoStack.push(entryIndex)
        return false
    }

    // --- 内部函数 ---

    /**
     * 对指定 entry 按方向执行日志序列（undo = 逆元、redo = 正向），经 commitBatchToGraphs 提交。
     *
     * @remarks
     * direction 仅决定三处数据选择：
     * 1. 批次来源：undo → entry.reversalBatches（逆元，含图级）；redo → entry.batches（正向）
     * 2. cursor 目标：undo → entry.parentIndex；redo → entryIndex
     * 3. 失败报告方向字符串：'undo' / 'redo'
     *
     * 其余逻辑共用：buildBatchesFromLogItems 组装 → commitBatchToGraphs（recordLog: false /
     * skipValidate: true / executedAt = entry.timestamp）→ 失败报告返回 false → 成功移 cursor。
     * 对称化执行路径：图级逆元与图内逆元同序列执行，不依赖持久化恢复
     * （delete_graph 已真删，逆元自包含重建）
     *
     * 执行成功后附带 orphanedParentHint：当前视图图被本次执行注销（registry 已无该图）时，
     * 从 entry 正向批提取其创建时的父图 id，供 goToNearestAvailableGraph 恢复视图；
     * 视图图仍在 registry 或无法提取时为 undefined（调用方走 root 兜底）。
     *
     * @param entryIndex - 操作日志 entry 索引
     * @param direction - 'undo'（逆元序列，cursor → parentIndex）或 'redo'（正向序列，cursor → entryIndex）
     * @returns 执行结果：ok = 是否成功（entry 不存在或校验失败为 false，此时无附带信息）；
     *          ok 为 true 时 orphanedParentHint 可能附带被注销视图图的父图 id。
     */
    function applyLogEntry(
        entryIndex: number,
        direction: 'undo' | 'redo',
    ): { ok: boolean; orphanedParentHint?: GraphId } {
        const entry = store.operationLog.entries[entryIndex]

        if (!entry) {
            return { ok: false }
        }

        const sourceItems =
            direction === 'undo' ? entry.reversalBatches : entry.batches
        const batch = buildBatchesFromLogItems(sourceItems, store.graphRegistry)

        if (batch.length > 0) {
            // skipValidate：逆元/正向序列中 add_edge 依赖同批 add_node 重建的端点，
            // applyBatch validate-all-first（Phase 1 基于输入图校验）必然误报
            // 故 skipValidate 是重放的必要机制（非防御兜底）
            const result = commitBatchToGraphs(batch, {
                recordLog: false,
                skipValidate: true,
                executedAt: entry.timestamp,
            })

            if (result.validation.valid === false) {
                reportReversalApplyFailure(entryIndex, direction) // 防御：正常不可达
                return { ok: false }
            }
        }

        store.operationLog.cursor =
            direction === 'undo' ? entry.parentIndex : entryIndex

        // 视图图已被本次执行注销（registry 无该图）时，从 entry 正向批提取其创建时的父图 id
        // 提供给 goToNearestAvailableGraph 恢复视图
        const viewId = store.graphViewId
        let orphanedParentHint: GraphId | undefined
        if (viewId && !store.graphRegistry.has(viewId)) {
            for (const item of entry.batches) {
                const addGraphOp = item.operations.find(
                    (op) => op.type === 'add_graph' && op.graph.id === viewId,
                )
                if (addGraphOp && addGraphOp.type === 'add_graph') {
                    orphanedParentHint = addGraphOp.graph.parentGraphId
                    break
                }
            }
        }

        return { ok: true, orphanedParentHint }
    }

    /**
     * undo / redo 后的视图一致性检查。
     * 视图图被注销（撤销含 add_graph 的批且正在查看该子图）时，将视图切到最近可达图。
     *
     * @remarks
     * 规则：
     * - graphViewId 为空或视图图仍在 registry → 直接返回（视图有效，无需处理）
     * - 视图图已注销（策略 A 真删，missing 是正常状态而非数据损坏）：
     *   优先切到 orphanedParentHint（undo 从 entry 提取的被注销视图图父图），
     *   hint 不可达 → 任一 root 图兜底；注册表全空 → 清空视图（graphViewId = null，graphPath = []）
     * - 切换后：buildGraphPath 重算 graphPath；末端为 root 时更新 lastActiveRootId
     *
     * @param orphanedParentHint - [可选] 被注销视图图的父图 id（undo 建图场景精确恢复；
     *                            无法提取时 undefined → root 兜底）
     */
    function goToNearestAvailableGraph(orphanedParentHint?: GraphId): void {
        const currentViewId = store.graphViewId
        if (!currentViewId) return
        if (store.graphView) return

        // 视图图已被注销（撤销含 add_graph 的批）：派生 graphView 立即为 null。
        // 优先 hint（父图通常仍在注册表），否则 root 兜底——不再从持久化取数据
        let fallback: GraphData | null = orphanedParentHint
            ? (lookupGraph(store.graphRegistry, orphanedParentHint) ?? null)
            : null

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
 */
function reportCycleDetected(parentId: GraphId): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [CYCLE_DETECTED] parentGraphId 链检测到环：图谱 "${parentId}" 被重复访问，已中断回溯`,
    )
}

/**
 * buildBatchesFromLogItems 组装 batch 时 registry 解析失败报告（开发者通道）。
 * 正常流程不可达（undo 的图在 registry 中、redo 的图有 add_graph 兜底），防御性处理。
 */
function reportRegistryResolveFailure(graphId: GraphId, context: string): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [REGISTRY_RESOLVE_FAILED] ${context}：图谱 "${graphId}" 不在注册表且无兜底，已跳过该 item`,
    )
}

/**
 * applyLogEntry 执行校验失败报告（开发者通道）。
 * 正常流程不可达（逆元目标存在由 validate 保证），防御性处理。
 */
function reportReversalApplyFailure(
    entryIndex: number,
    direction: 'undo' | 'redo',
): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [REVERSAL_APPLY_FAILED] ${direction} 执行 entry #${entryIndex} 时校验失败（正常流程不可达），已中断`,
    )
}

// ── 私有辅助（日志组装） ──

/**
 * 将批次映射为按图分组批（graphId + operations）。
 *
 * @remarks
 * inGraph 批取批目标图 id；graphLevel 批取首个操作的图 id（add_graph / delete_graph 均携带图数据）。
 */
function toBatchesLog(batch: OperationBatch): BatchesLog {
    if (batch.kind === 'inGraph') {
        return {
            graphId: batch.graph.id,
            operations: batch.operations,
        }
    } else {
        return {
            graphId: batch.operations[0]?.graph.id ?? '',
            operations: batch.operations,
        }
    }
}

/**
 * 将日志按图分组批组装为 applyBatches 可消费的判别联合批序列。
 *
 * @remarks
 * undo / redo 共用：undo 传 entry.reversalBatch（逆元，含图级），redo 传 entry.batch（正向）。
 * 每个 BatchesLog 内图级操作与图内操作拆分为独立批（applyBatches 判别联合要求）；
 * 图内批目标图从 registry 解析，缺失时用批内 add_graph.graph 兜底（跨 item 查找：
 * add_graph 批与填充批在日志中可能分离），仍缺则报告并跳过该 item。
 *
 * @param items - 按图分组的日志批
 * @param registry - 当前图注册表
 * @returns 判别联合批序列（可能为空——无操作或全部解析失败）。
 */
function buildBatchesFromLogItems(
    items: BatchesLog[],
    registry: GraphRegistry,
): OperationBatch[] {
    const batch: OperationBatch[] = []

    for (const item of items) {
        if (item.operations.length === 0) continue

        let graph = lookupGraph(registry, item.graphId)

        if (!graph) {
            // registry 缺失（undo 注销的 added 图）→ 用批内 add_graph.graph 兜底
            const addGraphOp = items
                .flatMap((i) => i.operations)
                .find(
                    (op) =>
                        op.type === 'add_graph' && op.graph.id === item.graphId,
                )
            if (addGraphOp && addGraphOp.type === 'add_graph') {
                graph = addGraphOp.graph
            } else {
                reportRegistryResolveFailure(item.graphId, 'undo/redo 组装')
                continue
            }
        }

        // 图级操作与图内操作分拆为独立批（applyBatches 判别联合要求）
        const graphLevelOps = item.operations.filter(isGraphLevelOperation)
        const inGraphOps = item.operations.filter(isInGraphOperation)
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

    return batch
}
