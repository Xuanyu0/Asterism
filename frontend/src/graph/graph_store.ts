/**
 * GraphData 唯一事实源与所有图修改的唯一合法入口（模块级单例）。
 *
 * @remarks
 * 持有当前视图图 / 路径 / 操作日志，协调多图注册表与 localStorage 持久化。
 * 留在本 store 的判定标准：
 * Graph.vue 调用 ∨ 唯一图数据修改入口（commitBatchToGraphs）∨ 唯一图数据回溯入口（undo / redo）。
 *
 * 响应式策略：graphView / graphPath / lastValidationResult 为 shallowReactive 顶层属性
 * （引用替换触发更新）；graphRegistry / operationLog / redoStack 为普通字段（raw 无代理），
 * 引擎 structuredClone 可直接克隆，无需 toRaw / markRaw 解包。
 */

import { shallowReactive } from 'vue'

import type { GraphData, GraphId } from '@my-project/graph-engine'
import type { GraphOperation } from '@my-project/graph-engine'
import type { ValidationResult } from '@my-project/graph-engine'
import type {
    ItemOperations,
    OperationLog,
    OperationLogEntry,
} from '@my-project/graph-engine'

import {
    applyBatch,
    createReversal,
    ensureDefaultCognitiveState,
    generateGraphId,
} from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/graph_registry'
import {
    createRegistry,
    registerGraph,
    lookupGraph,
    hasGraph,
} from '@/graph/graph_registry'

import {
    saveGraph,
    loadGraph,
    listSavedGraphIds,
    saveLastActiveRootId,
    loadLastActiveRootId,
} from '@/graph/graph_persistence'

import {
    applyAddGraph,
    applyDeleteGraph,
    revertAddGraph,
    revertDeleteGraph,
} from '@/graph/graph_signals'

import { isInRootTree } from '@/graph/utils/graph_tree'
import {
    DATA_INTEGRITY_PREFIX,
    reportCorruptedGraph,
} from '@/graph/utils/data_integrity_reporter'

/**
 * 一次批量提交中的单个图项：目标图与其待执行操作序列。
 * commitBatchToGraphs 入参元素与 applyEntry 组装 batch 时复用同一形态。
 */
export type OperationBatchItem = {
    graph: GraphData
    operations: GraphOperation[]
}

/**
 * GraphStore 公开 API：状态 + 方法入口。
 *
 * @remarks
 * 状态按职责分组：
 * - 视图态（响应式）：graphView / graphPath / lastValidationResult
 * - 多图缓存（普通字段）：graphRegistry
 * - 撤销日志（普通字段）：operationLog / redoStack
 */
export interface GraphStoreAPI {
    // 视图态（响应式，引用替换触发更新）
    graphView: GraphData | null
    graphPath: GraphId[]
    lastValidationResult: ValidationResult | null

    // 多图缓存（普通字段，raw 无代理）
    graphRegistry: GraphRegistry

    // 撤销日志（普通字段，raw 无代理）
    operationLog: OperationLog
    redoStack: number[]

    // 生命周期
    loadGraphToView(graphId: GraphId): boolean
    initRegistry(): void
    createRootGraph(title: string, opts?: { id?: GraphId }): GraphId

    // 内部行为
    clearValidationResult(): void

    // 功能行为
    commitBatchToGraphs(
        operationBatch: OperationBatchItem[],
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
        graphView: null as GraphData | null,
        graphPath: [] as GraphId[],
        lastValidationResult: null as ValidationResult | null,

        // —— 语义上非响应式状态 ——
        // 搭浅响应便车（shallowReactive 不深代理，保持 raw）。
        // 仅整体替换才触发响应式，实际只原地修改（Map.set / entries.push），故行为等价普通变量
        graphRegistry: createRegistry(),
        operationLog: { entries: [], cursor: -1 } as OperationLog,
        redoStack: [] as number[],

        // ── 方法（函数不被代理，原样保留）──
        loadGraphToView,
        initRegistry,
        createRootGraph,
        clearValidationResult,
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
        const result = loadGraph(graphId)

        if (!result.ok) {
            // missing（图不存在）为正常状态，静默；corrupted（图损坏）为系统异常，入开发者通道
            if (result.reason === 'corrupted') {
                reportCorruptedGraph(graphId, '已跳过加载')
            }
            return false
        }
        const graph = result.graph

        // 切换图谱：旧图的校验结果（错误提示）不再适用于新视图，一并清空
        store.graphView = ensureDefaultCognitiveState(graph)
        clearValidationResult()

        registerGraph(store.graphRegistry, graph)

        // 生命周期：根图谱 = 日志——仅当切换到不同根图树时重置操作日志与 redo 栈。
        // 同根图树内导航（子图↔根图）不清空。
        // previousRootId 必须在覆盖 graphPath 之前读取，才能与 path[0]（新根图 id）比较
        const previousRootId = store.graphPath[0]

        // 构建当前图在根图树中的路径（根→叶），供导航卡片渲染面包屑与"是否在根"判断
        const { path, terminal } = buildGraphPath(graph)
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
        // 记录最后活跃的根图 ID：下次启动时 initRegistry 据此恢复工作根图树
        if (terminal.kind === 'root') {
            saveLastActiveRootId(terminal.id)
        }

        return true
    }

    /**
     * 从 lastActiveRootId 恢复工作根图及其全部子孙子图到注册表。
     *
     * @remarks
     * 启动时注入整棵根图树，保证认知操作的跨图查询（makeLookup）能命中子图。
     * 调用后 registry 可能仍为空（无历史根图 / 历史根图已删或加载失败）——
     * 调用方不得假定调用后必有图，需自行兜底。
     *
     * kind 非 root 时仍静默返回，与"无历史根图"无法区分。需为异常路径增加可见性，
     * 待行为设计确定后处理。
     */
    function initRegistry(): void {
        const lastRootId = loadLastActiveRootId()
        if (!lastRootId) return

        const rootResult = loadGraph(lastRootId)
        if (!rootResult.ok) {
            // missing（历史根图已删）与"无历史根图"同属正常状态，静默；corrupted（数据损坏）入开发者通道，
            // 使"首次使用"与"持久化数据损坏"可在开发者通道区分
            if (rootResult.reason === 'corrupted') {
                reportCorruptedGraph(lastRootId, '已跳过加载')
            }
            return
        }
        if (rootResult.graph.kind !== 'root') return
        registerGraph(store.graphRegistry, rootResult.graph)

        // 预加载当前根图树的所有子图
        const allIds = listSavedGraphIds()
        for (const graphId of allIds) {
            if (
                graphId === lastRootId ||
                hasGraph(store.graphRegistry, graphId)
            )
                continue
            const result = loadGraph(graphId)
            if (!result.ok) {
                if (result.reason === 'corrupted') {
                    reportCorruptedGraph(graphId, '已跳过加载')
                }
                continue
            }
            if (!isInRootTree(result.graph, lastRootId)) continue
            registerGraph(store.graphRegistry, result.graph)
        }
    }

    /**
     * 创建一个新的空根图并立即持久化；若 opts.id 对应图已存在，跳过创建直接返回该 id。
     *
     * @remarks
     * 本函数不自动切换视图——调用方如需显示新图，需额外调用 loadGraphToView。
     * 创建后立即保存到 localStorage 并注册到 registry。
     *
     * @param title - 根图名称
     * @param opts - 可选。opts.id 指定固定 GraphId（幂等——已存在则跳过创建）。
     *               dev 种子数据（bootstrap）用它保证跨图引用（sourceGraphId）指向稳定 ID；
     *               生产路径（Graph.vue / NavigationPanel）不传，走随机 ID。
     * @returns 根图 ID（新建或已存在的原 ID）。
     */
    function createRootGraph(title: string, opts?: { id?: GraphId }): GraphId {
        const id = opts?.id ?? generateGraphId()

        // 幂等：若指定了 ID 且图已存在，直接返回，不覆盖
        if (opts?.id && loadGraph(opts.id).ok) {
            return id
        }

        const graph: GraphData = {
            id,
            kind: 'root',
            title,
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        }

        saveGraph(graph)
        registerGraph(store.graphRegistry, graph)

        return id
    }

    /**
     * 清除上一次操作的校验结果。
     *
     * @remarks
     * 供 UI 层在切换模式/工具/操作、关闭浮空窗时调用，确保用户不会看到已过期的校验错误消息。
     */
    function clearValidationResult(): void {
        store.lastValidationResult = null
    }

    /**
     * 对多个目标图批量执行操作，是全部图写入的统一入口。
     *
     * @remarks
     * 双存接线：执行同一生命周期内经 onBeforeEachOperation 回调逐操作构造逆元，
     * 整批成功后组装 OperationLogEntry 写入 operationLog（recordLog !== false 时）；
     * undo / redo 复用本函数（recordLog: false）驱动同一执行引擎。
     *
     * 执行分四阶段：逐项 applyBatch 执行（含逆元收集）→ 成功后统一提交状态 →
     * 兑现 add_graph / delete_graph 信号（graph_signals）→ 统一持久化 → 日志写入。
     *
     * 调用契约：
     * 1. 任一项执行失败即整批返回，不产生部分提交（latestGraphs 为局部变量，无部分状态泄漏）
     * 2. 同一图可在 operationBatch 中出现多次，后续项以前一项的结果图为输入
     * 3. 全部成功后统一持久化所有结果图
     * 4. options.recordLog 默认 true；false（undo/redo 执行）不追加 entry、不动 cursor、不清 redoStack
     *
     * 代码修改契约：
     * 1. add_graph / delete_graph 为引擎静默信号，由本函数兑现为 registry 副作用
     *    （软删，不触碰持久化）——经 graph_signals 收口
     * 2. 回调内 createReversal 抛异常（正常流程不可达，validate 已保证目标存在）
     *    不捕获、自然传播阻断整批——registry / 持久化 / 日志均无变化
     *
     * @param operationBatch - 图与其对应的操作序列的配对数组
     * @param options - [可选] recordLog：是否写入操作日志（默认 true）；
     *                  skipValidate：透传引擎 applyBatch，跳过 Phase 1 前提校验
     *                  （undo/redo 恢复型逆元批传 true，正向用户操作默认 false）；
     *                  source：操作来源的工具标识，透传写入 entry.source
     *                  （缺省 undefined = 未知来源，供操作日志树 UI 按来源分类）
     * @returns 校验结果（valid + issues 汇总）。
     */
    function commitBatchToGraphs(
        operationBatch: OperationBatchItem[],
        options?: {
            recordLog?: boolean
            skipValidate?: boolean
            source?: string
        },
    ): { validation: ValidationResult } {
        // 第一阶段：按顺序执行所有项，用 latestGraphs 跟踪同一图的中间状态；
        // 逐操作经 onBeforeEachOperation 回调构造逆元（仅图内操作，图级操作跳过）
        const latestGraphs = new Map<GraphId, GraphData>()
        const allIssues = []
        const reversalItems: ItemOperations[] = []

        for (const item of operationBatch) {
            // inputGraph：同一图被多个 item 修改时，后续基于前一个操作后图数据的结果。
            const inputGraph = latestGraphs.get(item.graph.id) ?? item.graph
            const perOpReversals: GraphOperation[][] = []

            const { graph: resultGraph, validation } = applyBatch(
                inputGraph,
                item.operations,
                {
                    skipValidate: options?.skipValidate, // 由 undo/redo传入，以跳过校验
                    onBeforeEachOperation:
                        options?.recordLog === false
                            ? undefined // undo/redo 执行时不收集逆元（日志已有）
                            : (op, graphBeforeOp) => {
                                  if (
                                      op.type === 'add_graph' ||
                                      op.type === 'delete_graph'
                                  )
                                      return // 图级操作由 graph_signals 在第三阶段正/逆向执行
                                  perOpReversals.push(
                                      createReversal(graphBeforeOp, op),
                                  )
                              },
                },
            )

            if (!validation.valid) {
                store.lastValidationResult = validation

                return { validation }
            }

            latestGraphs.set(item.graph.id, resultGraph)
            allIssues.push(...validation.issues)

            // 收尾：单次 Item 逆元收集
            if (perOpReversals.length > 0) {
                reversalItems.push({
                    graphId: item.graph.id,
                    operations: perOpReversals.reverse().flat(), // Item "内"逆序收集并打平，保证 undo 时正向执行顺序
                })
            }
        }

        // 第二阶段：全部成功后统一更新 state
        for (const [graphId, resultGraph] of latestGraphs) {
            // 同步更新 registry，保证 graphView 与 registry 中同图引用一致。
            // graphView 的图可能同时存在于 registry 中（例如通过 loadGraphToView 加载），
            // 只更新 graphView 会导致 registry 持有过期引用。
            registerGraph(store.graphRegistry, resultGraph)

            if (graphId === store.graphView?.id) {
                store.graphView = resultGraph
            }
        }

        // 第三阶段：处理 add_graph / delete_graph 信号操作（图级兑现收口到 graph_signals）
        //
        // 引擎 execute 层对 add_graph / delete_graph 是静默的，
        // 这些操作是 compose→Runtime 的信号。
        // graphStore 作为统一执行入口负责把信号兑现为 registry 副作用。
        for (const item of operationBatch) {
            for (const operation of item.operations) {
                if (operation.type === 'add_graph') {
                    const builtGraph = latestGraphs.get(operation.graph.id)
                    const targetGraph = builtGraph ?? operation.graph // 有由批操作构造完的图就用它，否则用 add_graph 自带的图

                    applyAddGraph(store.graphRegistry, targetGraph)

                    // 补持久化：未进入 latestGraphs 的图（比方说 Deconstruct 后得到的图），
                    if (!builtGraph) {
                        saveGraph(targetGraph)
                    }
                }

                if (operation.type === 'delete_graph') {
                    applyDeleteGraph(store.graphRegistry, operation.graphId)
                }
            }
        }

        // 第四阶段：统一持久化结果图
        for (const resultGraph of latestGraphs.values()) {
            saveGraph(resultGraph)
        }

        // 操作日志写入（双存模型）
        // 整批成功后组装 entry 追加、cursor 前进、清空 redoStack
        // 用户新操作使 redo 失效
        if (options?.recordLog !== false && operationBatch.length > 0) {
            const graphSignals: OperationLogEntry['graphSignals'] = {
                added: [],
                deleted: [],
            }

            for (const item of operationBatch) {
                for (const operation of item.operations) {
                    if (operation.type === 'add_graph')
                        graphSignals.added.push(operation.graph.id)
                    if (operation.type === 'delete_graph')
                        graphSignals.deleted.push(operation.graphId)
                }
            }

            const entry: OperationLogEntry = {
                operation: operationBatch.map((item) => ({
                    graphId: item.graph.id,
                    operations: item.operations,
                })),
                reversalOperations: reversalItems.reverse(), // item "间"逆序
                graphSignals,
                parentIndex: store.operationLog.cursor,
                timestamp: new Date().toISOString(),
                source: options?.source, // 来源工具标识，缺省 undefined = 未知来源
            }

            store.operationLog.entries.push(entry)
            store.operationLog.cursor = store.operationLog.entries.length - 1
            store.redoStack = []
        }

        const validation: ValidationResult = {
            valid: true,
            issues: allIssues,
        }

        store.lastValidationResult = validation

        return { validation }
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
            const batch: OperationBatchItem[] = []
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

                batch.push({ graph, operations: reversalItem.operations })
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
            const batch: OperationBatchItem[] = []
            for (const forwardItem of entry.operation) {
                let graph = lookupGraph(
                    store.graphRegistry,
                    forwardItem.graphId,
                )

                if (!graph) {
                    // registry 缺失（undo 注销的 added 图）→ 用 add_graph.graph 兜底
                    const addGraphOp = forwardItem.operations.find(
                        (op) => op.type === 'add_graph',
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

                batch.push({ graph, operations: forwardItem.operations })
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
     *
     * @remarks
     * graphView 指向的图被注销（撤销含 add_graph 的批且正在查看该子图）时，
     * 将视图切到最近可达图。规则：
     * - graphView 为空或仍在 registry → 直接返回（视图有效，无需处理）
     * - 否则按优先级寻找 fallback：
     *   1. 沿 parentGraphId 上溯找最近可达祖先（registry 优先，缺失则从持久化惰性加载注册；
     *      环 / 链断裂 → 停止上溯）
     *   2. 任一 root 图（registry 中 kind === 'root'）
     *   3. 均无 → 清空视图（graphView = null，graphPath = []）
     * - 切换后：buildGraphPath 重算 graphPath；末端为 root 时更新 lastActiveRootId
     */
    function ensureViewConsistency(): void {
        const currentView = store.graphView
        if (!currentView) return
        if (lookupGraph(store.graphRegistry, currentView.id)) return

        let fallback: GraphData | null = null
        let cursorGraph = currentView
        const visited = new Set<GraphId>([cursorGraph.id])

        while (cursorGraph.parentGraphId) {
            const parentId = cursorGraph.parentGraphId

            if (visited.has(parentId)) break // 环防御
            visited.add(parentId)

            const parent = findParentGraph(store.graphRegistry, parentId)
            if (!parent) {
                // 数据损坏：被注销图的父图在 registry 与持久化均不可达（正常流程软删保留数据），
                // 开发者通道报告后走 root 兜底
                reportBrokenAncestorChain(
                    currentView.id,
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
            // 注册表全空：视图清空（graphView 为 null，graphPath 为空）
            store.graphView = null
            store.graphPath = []
            return
        }

        store.graphView = fallback
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
