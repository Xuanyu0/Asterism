/**
 * graph_store.ts
 *
 * 功能：
 *
 *     使用 Pinia 管理知识图谱 GraphData 状态，并统一执行图操作。
 *
 * 总体结构：
 *
 *     1. graphView  — 当前正在渲染在画布上的图
 *     2. graphPath  — 当前图路径
 *     3. undoStack  — 全操作撤销栈（Step 12 将升级为 OperationLog）
 *     4. applyBatchToGraph / applyBatchToGraphs  — 所有图操作的唯一入口
 *
 * 规则：
 *
 *     1. graphView 是当前渲染视图的事实源，不是操作目标的唯一绑定。
 *     2. Draft 数据禁止进入本 Store。
 *     3. Cytoscape Runtime 禁止进入本 Store。
 *
 * 外部如何使用：
 *
 *     import { useGraphStore } from '@/graph/graph_store'
 *     const graphStore = useGraphStore()
 *     graphStore.loadGraphToView(graphId)
 *     graphStore.applyBatchToGraph(graph, [operation])
 *     graphStore.applyBatchToGraphs([
 *         { graph: parentGraph, operations: parentOps },
 *         { graph: childGraph, operations: childOps },
 *     ])
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { GraphData, GraphId, GraphLookup } from '@my-project/graph-engine'
import type { GraphOperation } from '@my-project/graph-engine'
import type { ValidationResult } from '@my-project/graph-engine'

import { applyBatch, normalizeGraph, generateGraphId } from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/graph_registry'
import { createRegistry, registerGraph, unregisterGraph, lookupGraph, hasGraph } from '@/graph/graph_registry'

import { saveGraph, loadGraph, deleteGraph, listSavedGraphIds, listRootGraphIds, saveLastActiveRootId, loadLastActiveRootId, clearLastActiveRootId } from '@/graph/graph_persistence'

const MAX_UNDO_STACK_SIZE = 20


/**
 * 功能：
 *
 *     多图批量操作的目标单元。
 */
export interface ApplyBatchTarget {
    /** 目标图。 */
    graph: GraphData

    /** 对该图执行的操作序列。 */
    operations: GraphOperation[]
}


/**
 * 功能：
 *
 *     根图谱列表项的摘要信息，供导航卡片展示根图谱列表。
 *
 * 规则：
 *
 *     1. 只包含列表展示所需的最小字段，不携带 nodes / edges。
 */
export interface RootGraphSummary {
    /** 根图 ID。 */
    id: GraphId

    /** 根图标题。 */
    title: string

    /** 最近更新时间戳。引擎当前未维护此字段，保留供未来排序使用。 */
    updatedAt?: string
}

/**
 * 功能：
 *
 *     保存当前 GraphData 副本到撤销栈，并限制栈最大长度。
 *
 * 规则：
 *
 *     JSON 序列化而非 structuredClone——Pinia reactive proxy 无法被 structuredClone。
 *
 * 消费者：
 *
 *     applyBatchToGraphs（undo snapshot）
 */
export function pushUndoSnapshot(undoStack: GraphData[], graph: GraphData): GraphData[] {
    const snapshot: GraphData = JSON.parse(JSON.stringify(graph))

    return [...undoStack, snapshot].slice(-MAX_UNDO_STACK_SIZE)
}


/**
 * 功能：
 *
 *     Graph Runtime 状态定义。
 *
 * 规则：
 *
 *     1. graphView 是当前渲染视图的事实源。
 *     2. Draft 数据禁止进入本 Store。
 *     3. Cytoscape Runtime 禁止进入本 Store。
 *
 * 消费者：
 *
 *     useGraphStore（state 初始化）
 */
export interface GraphStoreState {
    /** 当前正在渲染在画布上的图。 */
    graphView: GraphData | null

    /** 当前图路径，用于子图逐级返回。 */
    graphPath: GraphId[]

    /** 最近一次操作校验结果。操作执行后由 applyBatchToGraph / applyBatchToGraphs 写入。 */
    lastValidationResult: ValidationResult | null

    /** 全操作撤销栈，刷新网页后自然清空。 */
    undoStack: GraphData[]

    /** 最近一次成功保存当前图谱的时间戳。 */
    lastSaveTime: number | null

    /** 多图注册表，由 localStorage 中全部已保存 GraphData 重建的运行时索引。 */
    graphRegistry: GraphRegistry
}

/**
 * 功能：
 *
 *     创建 Graph Store 实例，管理 GraphData 状态与图操作。
 *     GraphData 唯一事实源，所有图数据修改必须经过本 Store。
 *
 * 总体结构：
 *
 *     1. 状态  — 当前图数据、选中状态、撤销栈
 *     2. API  — 图操作入口（loadGraphToView / applyBatchToGraph / applyBatchToGraphs 等）
 *
 * 规则：
 *
 *     1. Draft 数据与 Cytoscape Runtime 禁止进入本 Store。
 *     2. UI Runtime 必须通过 operation_controller 间接调用本 Store。
 *     3. 所有修改委托引擎 applyBatch 执行 validate + execute。
 *     4. applyBatchToGraph / applyBatchToGraphs 可传入持久化参数每次修改时自动持久化。
 *
 */
export const useGraphStore = defineStore('graph_store', () => {
    const graphView = ref<GraphData | null>(null)
    const graphRegistry = ref<GraphRegistry>(createRegistry())
    const graphPath = ref<GraphId[]>([])
    const undoStack = ref<GraphData[]>([])

    const lastSaveTime = ref<number | null>(null)
    const lastValidationResult = ref<ValidationResult | null>(null)
    
    /**
     * 功能：
     *
     *     从持久化存储加载图谱，切换为当前视图图。
     *
     *     这是用户切换图谱的唯一入口。负责 normalize + 状态重置、
     *     "从 localStorage 加载"、"写入 runtime registry"、
     *     以及沿 parentGraphId 回溯构建完整 graphPath（根→叶）。
     *
     * 规则：
     *
     *     1. 找不到对应 GraphData 时写入 lastValidationResult 错误信息并返回 false。
     *     2. 加载成功后将图写入 registry（跨图操作可见）。
     *     3. 祖先图仅加载自身，不加载祖先图的子图。
     *     4. 祖先图不在 registry 中时从 localStorage 惰性加载并注册。
     *     5. 本函数不负责完整图校验。
     *
     * 使用：
     *
     *     const success = graphStore.loadGraphToView(graphId)
     *     注意：未来由图谱列表 UI 调用
     *
     * 消费者：
     *
     *     main.ts / 图谱列表 UI（待实现）
     */
    function loadGraphToView(graphId: GraphId): boolean {
        const graph = loadGraph(graphId)

        if (!graph) {
            lastValidationResult.value = {
                valid: false,
                issues: [{
                    severity: 'error',
                    code: 'LOAD_FAILED',
                    message: `图谱 "${graphId}" 加载失败`,
                    targetType: 'graph',
                    targetId: graphId,
                }],
            }
            return false
        }

        // 读取时即设置当前显示的图谱
        graphView.value = normalizeGraph(graph)
        lastValidationResult.value = null
        undoStack.value = []

        registerGraph(graphRegistry.value, graph)

        // 沿 parentGraphId 回溯构建完整 graphPath（根→叶）
        // 算法参考引擎 buildGraphPath，但用 loadGraph 作为 registry 未命中时的 fallback
        const path: GraphId[] = [graph.id]
        const visited = new Set<GraphId>([graph.id])
        let currentGraph: GraphData = graph
        while (currentGraph.parentGraphId) {
            const parentId = currentGraph.parentGraphId

            // 环检测：防止异常数据导致无限循环
            if (visited.has(parentId)) {
                break
            }
            visited.add(parentId)

            const parentInRegistry = lookupGraph(graphRegistry.value, parentId)
            const parent = parentInRegistry ?? loadGraph(parentId)

            if (!parent) {
                break
            }

            // 祖先图不在 registry 中时加载并注册
            if (!parentInRegistry) {
                registerGraph(graphRegistry.value, parent)
            }

            path.unshift(parentId)
            currentGraph = parent
        }
        graphPath.value = path

        // 祖先链断裂检测：while 循环因 parent 不存在或环检测而提前退出时，
        // currentGraph.parentGraphId 仍有值（未找到对应图谱），报告 warning
        if (currentGraph.parentGraphId) {
            lastValidationResult.value = {
                valid: true,
                issues: [{
                    severity: 'warning',
                    code: 'ANCESTOR_CHAIN_BROKEN',
                    message: `图谱 "${graphId}" 的父链在 "${currentGraph.id}" 处中断：祖先图谱 "${currentGraph.parentGraphId}" 不可达`,
                    targetType: 'graph',
                    targetId: currentGraph.parentGraphId,
                }],
            }
        }

        // 记录最后活跃的根图 ID：回溯链末端的图若确实是根图则写入。
        if (currentGraph.kind === 'root') {
            saveLastActiveRootId(currentGraph.id)
        }

        return true
    }

    /**
     * 功能：
     *
     *     沿 parentGraphId 链回溯，判断 graph 是否属于指定根图树。
     *
     * 规则：
     *
     *     1. graph.id === rootId 时返回 true（根图自身）。
     *     2. 沿 parentGraphId 逐级上溯，若某级 parentGraphId === rootId 返回 true。
     *     3. 链中断（parentGraphId 对应的图不存在）或环检测命中返回 false。
     *     4. 抵达其他根图（parentGraphId === undefined 但当前图不是 rootId）返回 false。
     */
    function isInRootTree(graph: GraphData, rootId: GraphId): boolean {
        if (graph.id === rootId) return true

        let current = graph
        const visited = new Set<GraphId>([graph.id])
        while (current.parentGraphId) {
            if (current.parentGraphId === rootId) return true
            if (visited.has(current.parentGraphId)) return false  // 环检测
            visited.add(current.parentGraphId)

            const parent = loadGraph(current.parentGraphId)
            if (!parent) return false

            current = parent
        }
        return false  // 抵达某根图（parentGraphId === undefined），但不是我们的根图
    }

    /**
     * 功能：
     *
     *     从 lastActiveRootId 恢复工作根图及其全部子孙子图到注册表。
     *
     *     启动时注入根图树（根图 + 所有 parentGraphId 链终点为该根图的子图），
     *     避免认知操作（diverge / induce）因子图未注册而触发惰性加载。
     *
     *     找不到 lastActiveRootId 或加载失败时注册表保持空，
     *     由 Graph.vue 哨兵创建新根图。
     *
     * 规则：
     *
     *     1. 应用启动时调用一次。
     *     2. 加载 lastActiveRootId 对应的根图，再扫描全部已保存图，
     *        用 isInRootTree 筛选属于同一树的所有子图一并注册。
     *     3. 不属于当前根图的其他根图子树不进入注册表。
     *     4. 注册表可能为空（首次使用或上次根图已删除），由哨兵兜底。
     *
     * 使用：
     *
     *     graph_store 首次创建后，由 Graph.vue onMounted 触发。
     *
     * 消费者：
     *
     *     Graph.vue onMounted
     */
    function initRegistry(): void {
        const lastRootId = loadLastActiveRootId()
        if (!lastRootId) return

        const rootGraph = loadGraph(lastRootId)
        if (!rootGraph || rootGraph.kind !== 'root') return
        registerGraph(graphRegistry.value, rootGraph)

        // 预加载当前根图树的所有子图
        const allIds = listSavedGraphIds()
        for (const graphId of allIds) {
            if (graphId === lastRootId || hasGraph(graphRegistry.value, graphId)) continue
            const graph = loadGraph(graphId)
            if (!graph) continue
            if (!isInRootTree(graph, lastRootId)) continue
            registerGraph(graphRegistry.value, graph)
        }
    }

    /**
     * 功能：
     *
     *     创建一个新的空根图并持久化。
     *     若提供 id 且该 id 对应的图已存在，则跳过创建直接返回 id（幂等）。
     *
     *     本函数不自动切换视图——调用方如需显示新图，需额外调用 loadGraphToView。
     *
     * 规则：
     *
     *     1. 默认使用引擎 generateGraphId() 生成 ID。
     *     2. 可通过 opts.id 指定固定 ID——幂等保证，图已存在则跳过创建。
     *     3. 根图的 parentGraphId 和 ownerNodeId 为 undefined。
     *     4. 创建后立即保存到 localStorage 并注册到 registry。
     *     5. 不修改 graphView / graphPath 等运行时状态。
     *
     * 参数：
     *
     *     title — 根图名称
     *     opts  — 可选。opts.id 指定固定 GraphId（幂等——已存在则跳过）
     *
     * 使用：
     *
     *     const graphId = graphStore.createRootGraph('My Graph')
     *     graphStore.loadGraphToView(graphId)
     *
     *     // 固定 ID——幂等，反复调用不会覆盖已有数据：
     *     const graphId = graphStore.createRootGraph('金牌测试图', { id: 'graph-golden' })
     */
    function createRootGraph(title: string, opts?: { id?: GraphId }): GraphId {
        const id = opts?.id ?? generateGraphId()

        // 幂等：若指定了 ID 且图已存在，直接返回，不覆盖
        if (opts?.id && loadGraph(opts.id)) {
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
        registerGraph(graphRegistry.value, graph)

        return id
    }

    /**
     * 功能：
     *
     *     按 ID 从多图注册表中查找图。
     *
     * 使用：
     *
     *     认知操作（diverge、induce）等跨图场景前，前端通过此函数获取目标图。
     *
     * 消费者：
     *
     *     operation_controller（Cognition 模式）
     */
    function getGraphById(graphId: GraphId): GraphData | undefined {
        return lookupGraph(graphRegistry.value, graphId)
    }

    /**
     * 功能：
     *
     *     创建供引擎 compose 层使用的跨图查询函数。
     *
     *     引擎各 compose 函数通过 GraphLookup 只读访问多图数据，
     *     不依赖具体 Map 实现。本方法将 Runtime 持有的 graphRegistry
     *     包装为 (graphId) → GraphData | undefined 的纯查询函数。
     *
     * 消费者：
     *
     *     operation_controller（induce / internalize / diverge 调用前构造 lookupGraph 参数）
     */
    function makeLookup(): GraphLookup {
        return (graphId: GraphId): GraphData | undefined => lookupGraph(graphRegistry.value, graphId)
    }

    /**
     * 功能：
     *
     *     清除上一次操作的校验结果。
     *     供 UI 层在切换模式/工具/操作、关闭浮空窗时调用，
     *     确保用户不会看到已过期的校验错误消息。
     */
    function clearValidationResult() {
        lastValidationResult.value = null
    }
    
    /**
     * 功能：
     *
     *     删除本地持久化中的图谱数据。
     *
     * 规则：
     *
     *     1. 不影响当前运行中的 graphView。
     *     2. 只删除本地存储中的记录。
     *     3. 如果删除的是当前图谱的持久化副本，当前内存中的图谱仍然保留。
     *
     * 使用：
     *
     *     graphStore.deleteSavedGraph(graphId)
     */
    function deleteSavedGraph(graphId: GraphId): void {
        deleteGraph(graphId)
        unregisterGraph(graphRegistry.value, graphId)
    }

    /**
     * 功能：
     *
     *     列出 localStorage 中全部根图谱的摘要，供导航卡片展示与切换。
     *
     * 规则：
     *
     *     1. 数据来自持久化全量扫描，不经过 graphRegistry——
     *        registry 只持有当前根图树，无法覆盖全部根图。
     *     2. 按标题字典序排序（updatedAt 引擎未维护，不参与排序）。
     *     3. 本函数不修改任何运行时状态。
     *
     * 使用：
     *
     *     const summaries = graphStore.listRootGraphSummaries()
     *
     * 消费者：
     *
     *     GraphNavigationCard（Expand 面板根图谱列表）
     */
    function listRootGraphSummaries(): RootGraphSummary[] {
        const summaries: RootGraphSummary[] = []

        for (const graphId of listRootGraphIds()) {
            const graph = loadGraph(graphId)
            if (!graph) continue
            summaries.push({ id: graph.id, title: graph.title, updatedAt: graph.updatedAt })
        }

        return summaries.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    }

    /**
     * 功能：
     *
     *     删除一个根图及其全部子孙子图（级联删除整棵图树）。
     *
     * 规则：
     *
 *     1. 若 rootId 为当前视图所在根图，直接返回不删除——
 *        删除活跃根图会使视图失去持久化副本。
     *     2. 通过 isInRootTree 判定归属，防止只删根图留下孤儿子图
     *        污染 listSavedGraphIds 的全量扫描结果。
     *     3. 删除后同步清理指向该根图的 lastActiveRootId 标记。
     *
     * 参数：
     *
     *     rootId — 要删除的根图 ID，与其全部子孙子图一并删除。
     *
     * 使用：
     *
     *     graphStore.deleteRootGraphTree(rootId)
     *
     * 消费者：
     *
     *     GraphNavigationCard（根图谱列表删除按钮）
     */
    function deleteRootGraphTree(rootId: GraphId): void {
        // 防御：禁止删除当前视图所在的根图。删除活跃根图会使视图
        // 失去持久化副本，且 graphView 会悬挂在已不存在的图上。
        const currentRootId = graphPath.value[0]
        if (currentRootId !== undefined && currentRootId === rootId) {
            return
        }

        // 第一遍：收集整棵树的成员。必须在删除前完成——isInRootTree 沿
        // parentGraphId 逐级 loadGraph 回溯，边扫描边删除会使孙图的父链断裂，
        // 导致深层子图被判定为"不属于本树"而漏删。
        const treeIds: GraphId[] = []
        for (const graphId of listSavedGraphIds()) {
            if (graphId === rootId) {
                treeIds.push(graphId)
                continue
            }

            const graph = loadGraph(graphId)
            if (!graph || !isInRootTree(graph, rootId)) continue

            treeIds.push(graphId)
        }

        // 第二遍：统一删除
        for (const graphId of treeIds) {
            deleteSavedGraph(graphId)
        }

        if (loadLastActiveRootId() === rootId) {
            clearLastActiveRootId()
        }
    }

    /**
     * 功能：
     *
     *     对单个目标图执行批量操作。
     *
     *     本函数是 applyBatchToGraphs 的单图包装。
     *
     * 规则：
     *
     *     1. 委托 applyBatchToGraphs 执行统一的事务管理。
     *     2. 目标图是 graphView 时更新视图并记录 undo snapshot。
     *     3. 目标图是 registry 中图时更新 registry。
     *     4. 默认自动持久化结果图。
     *
     * 参数：
     *
     *     targetGraph — 要操作的目标图
     *     operations  — 操作序列
     *     persist     — 是否持久化结果图。默认 true。
     *
     * 使用：
     *
     *     graphStore.applyBatchToGraph(graphView, [op])
     */
    function applyBatchToGraph(
        targetGraph: GraphData,
        operations: GraphOperation[],
        persist?: boolean,
    ): { validation: ValidationResult } {
        const result = applyBatchToGraphs(
            [{ graph: targetGraph, operations }],
            persist,
        )
        lastValidationResult.value = result.validation

        return result
    }

    /**
     * 功能：
     *
     *     对多个目标图批量执行操作，保证跨图事务原子性。
     *
     *     所有目标图按数组顺序执行；任一目标失败则整批丢弃，不修改任何 state；
     *     全部成功后统一更新 state 并持久化。
     *
     * 规则：
     *
     *     1. 全部目标先执行，失败即返回。
     *     2. 成功后才统一更新 graphView / registry。
     *     3. graphView 的 undo snapshot 在批量开始前只拍一次。
     *     4. 支持同一图在 targets 中出现多次，后续 target 读取前面 target 的结果图。
     *     5. 默认自动持久化所有结果图。
     *
     * 参数：
     *
     *     targets — 目标图与操作序列的配对数组
     *     persist  — 是否持久化所有结果图。默认 true。
     *
     * 使用：
     *
     *     graphStore.applyBatchToGraphs([
     *         { graph: parentGraph, operations: parentOps },
     *         { graph: childGraph, operations: childOps },
     *     ])
     */
    function applyBatchToGraphs(
        targets: ApplyBatchTarget[],
        persist?: boolean,
    ): { validation: ValidationResult } {
        persist = persist ?? true

        if (targets.length === 0) {
            const emptyValidation: ValidationResult = { valid: true, issues: [] }

            lastValidationResult.value = emptyValidation

            return { validation: emptyValidation }
        }

        // 第一阶段：按顺序执行所有 target，用 latestGraphs 跟踪同一图的中间状态
        const latestGraphs = new Map<GraphId, GraphData>()
        const allIssues = []

        for (const target of targets) {
            const inputGraph = latestGraphs.get(target.graph.id) ?? target.graph
            const { graph: resultGraph, validation } = applyBatch(inputGraph, target.operations)

            if (!validation.valid) {
                lastValidationResult.value = validation

                return { validation }
            }

            latestGraphs.set(target.graph.id, resultGraph)
            allIssues.push(...validation.issues)
        }

        // 全部成功后：为 graphView 拍 undo snapshot（只拍一次，记录批量操作前状态）。
        // 所有修改 GraphData 的操作都需要撤销支持。
        const hasGraphViewTarget = targets.some(target => target.graph.id === graphView.value?.id)
        const needsUndoSnapshot = hasGraphViewTarget
            && targets.some(target => target.operations.some((op) => {
                // 仅对修改 GraphData 的操作拍 undo snapshot，非修改操作不需要。
                switch (op.type) {
                    case 'add_node':
                    case 'add_edge':
                    case 'delete_node':
                    case 'delete_edge':
                    case 'update_node':
                    case 'update_edge':
                    case 'move_node':
                    case 'collapse_dependency':
                    case 'expand_dependency':
                        return true
                    default:
                        return false
                }
            }))

        if (needsUndoSnapshot && graphView.value) {
            undoStack.value = pushUndoSnapshot(undoStack.value, graphView.value)
        }

        // 第二阶段：全部成功后统一更新 state
        for (const [graphId, resultGraph] of latestGraphs) {
            // 同步更新 registry，保证 graphView 与 registry 中同图引用一致。
            // graphView 的图可能同时存在于 registry 中（例如通过 loadGraphToView 加载），
            // 只更新 graphView 会导致 registry 持有过期引用。
            registerGraph(graphRegistry.value, resultGraph)

            if (graphId === graphView.value?.id) {
                graphView.value = resultGraph
            }
        }

        // 第三阶段：处理 add_graph / delete_graph 信号操作
        //
        // 引擎 execute 层对 add_graph / delete_graph 是静默的（它们不修改 GraphData），
        // 这些操作是 compose→Runtime 的信号。graphStore 作为统一执行入口，负责把信号
        // 兑现为 registry 和持久化的副作用。
        for (const target of targets) {
            for (const operation of target.operations) {
                if (operation.type === 'add_graph') {
                    registerGraph(graphRegistry.value, operation.graph)

                    if (persist) {
                        saveGraph(operation.graph)
                    }
                }

                if (operation.type === 'delete_graph') {
                    unregisterGraph(graphRegistry.value, operation.graphId)

                    if (persist) {
                        deleteGraph(operation.graphId)
                    }
                }
            }
        }

        // 第四阶段：统一持久化结果图
        if (persist) {
            for (const resultGraph of latestGraphs.values()) {
                saveGraph(resultGraph)
            }

            // 若当前视图图被持久化，记录最近一次保存时间。
            if (hasGraphViewTarget) {
                lastSaveTime.value = Date.now()
            }
        }

        const validation: ValidationResult = {
            valid: true,
            issues: allIssues,
        }

        lastValidationResult.value = validation

        return { validation }
    }

    /**
     * 功能：
     *
     *     撤销最近一次操作。
     *
     * 规则：
     *
     *     1. 恢复完整 GraphData Snapshot。
     *     2. 覆盖所有修改操作（add / delete / update / move / fold / expand）。
     *     3. 刷新网页后 Undo 自动失效。
     *
     * 使用：
     *
     *     operation_controller.undo() 调此方法。
     */
    function undo(): boolean {
        const previousGraph = undoStack.value.pop()

        if (!previousGraph) {
            return false
        }
        graphView.value = previousGraph

        return true
    }

    return {
        graphView,
        graphPath,

        graphRegistry,
        undoStack,
        lastSaveTime,
        lastValidationResult,

        // 生命周期
        loadGraphToView,
        initRegistry,
        createRootGraph,
        
        // 内部行为
        getGraphById,
        makeLookup,
        clearValidationResult,
        
        // 功能行为
        deleteSavedGraph,
        listRootGraphSummaries,
        deleteRootGraphTree,
        applyBatchToGraph,
        applyBatchToGraphs,
        undo,
    }
})
