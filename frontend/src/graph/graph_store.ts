/**
 * 说明：
 *
 *     GraphData 唯一事实源与所有图修改的唯一合法入口。
 *     持有当前图 / 路径 / 撤销栈，协调多图注册表与 localStorage 持久化。
 *
 * 调用契约：
 *
 *     1. 操作目标可能是父/子图，不绑定当前渲染视图（graphView 只是渲染投影）。
 *     2. Draft 数据禁止进入本 Store。
 *     3. Cytoscape Runtime 禁止进入本 Store。
 *
 * TODO：
 *
 *     本文件多数函数错误路径静默返回（跳过 / 拒绝 / 中断），依赖调用方前置条件正确：
 *     如 initRegistry 静默返回、listRootGraphInfos 静默跳过加载失败的图、
 *     deleteRootGraphTree 静默拒绝删除活跃根图等。只有 loadGraphToView 与
 *     commitBatchToGraphs 有显式错误出口。调用方又以兜底逻辑掩盖空状态，
 *     导致持久化数据损坏在用户层面不可见。需统一错误处理策略（显式返回状态
 *     或写入 lastValidationResult），待行为设计确定后处理。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { GraphData, GraphId, GraphLookup } from '@my-project/graph-engine'
import type { GraphOperation } from '@my-project/graph-engine'
import type { ValidationResult } from '@my-project/graph-engine'

import { applyBatch, ensureDefaultCognitiveState, generateGraphId } from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/graph_registry'
import { createRegistry, registerGraph, unregisterGraph, lookupGraph, hasGraph } from '@/graph/graph_registry'

import { saveGraph, loadGraph, deleteGraph, listSavedGraphIds, listRootGraphIds, saveLastActiveRootId, loadLastActiveRootId, clearLastActiveRootId } from '@/graph/graph_persistence'

const MAX_UNDO_STACK_SIZE = 20

/**
 * 说明：
 *
 *     根图谱列表项的摘要信息，供导航卡片展示根图谱列表。
 *
 * 代码修改契约：
 *
 *     1. 只包含列表展示所需的最小字段，不携带 nodes / edges。
 */
export interface RootGraphInfo {
    /** 根图 ID。 */
    id: GraphId

    /** 根图标题。 */
    title: string

    /** 最近更新时间戳（图级，引擎维护）。 */
    updatedAt?: string
}

/**
 * 说明：
 *
 *     创建 Graph Store 单例，暴露全部图操作入口（职责与边界见文件头说明）。
 *
 * 调用契约：
 *
 *     1. UI Runtime 可通过 feature-tools handler 直接调 commitBatchToGraph，不经过 operation_controller。
 *     2. 所有修改委托引擎 applyBatch 执行 validate + execute，成功后自动持久化。
 */
export const useGraphStore = defineStore('graph_store', () => {
    const graphView = ref<GraphData | null>(null)
    const graphRegistry = ref<GraphRegistry>(createRegistry())
    const graphPath = ref<GraphId[]>([])
    const undoStack = ref<GraphData[]>([])

    const lastSaveTime = ref<number | null>(null)
    const lastValidationResult = ref<ValidationResult | null>(null)
    
    /**
     * 说明：
     *
     *     用户切换图谱的唯一入口：从持久化加载图谱并设为当前视图。
     *
     * 调用契约：
     *
     *     1. 本函数不负责完整图校验。
     *     2. 切换成功即清空撤销栈。
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

        // 切换图谱：旧图的校验结果（错误提示）与撤销历史不再适用于新视图，一并清空
        graphView.value = ensureDefaultCognitiveState(graph)
        clearValidationResult()
        undoStack.value = []

        registerGraph(graphRegistry.value, graph)

        // 构建当前图在根图树中的路径（根→叶），供导航卡片渲染面包屑与"是否在根"判断
        const { path, terminal } = buildGraphPath(graph)
        graphPath.value = path

        // 祖先链断裂检测
        if (terminal.parentGraphId) {
            lastValidationResult.value = {
                valid: true,
                issues: [{
                    severity: 'warning',
                    code: 'ANCESTOR_CHAIN_BROKEN',
                    message: `图谱 "${graphId}" 的父链在 "${terminal.id}" 处中断：祖先图谱 "${terminal.parentGraphId}" 不可达`,
                    targetType: 'graph',
                    targetId: terminal.parentGraphId,
                }],
            }
        }

        // 记录最后活跃的根图 ID：下次启动时 initRegistry 据此恢复工作根图树
        if (terminal.kind === 'root') {
            saveLastActiveRootId(terminal.id)
        }

        return true
    }

    /**
     * 说明：
     *
     *     从 lastActiveRootId 恢复工作根图及其全部子孙子图到注册表。
     *     启动时注入整棵根图树，保证认知操作的跨图查询（makeLookup）能命中子图
     *
     * 调用契约：
     *
     *     1. 应用启动时调用一次。
     *     2. 调用后 registry 可能仍为空（无历史根图 / 历史根图已删或加载失败）——
     *        调用方不得假定调用后必有图，需自行兜底。
     *
     * TODO：
     *
     *     历史根图损坏（loadGraph 失败 / kind 非 root）与"无历史根图"均静默返回，
     *     调用方无法区分"首次使用"与"持久化数据损坏"，后者会在下游兜底逻辑中
     *     被当作首次使用掩盖。需为异常路径增加可见性（写 lastValidationResult
     *     或返回状态），待行为设计确定后处理。
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
     * 说明：
     *
     *     创建一个新的空根图并立即持久化；若 opts.id 对应图已存在，跳过创建直接返回该 id。
     *
     * 调用契约：
     *
     *     1. 本函数不自动切换视图——调用方如需显示新图，需额外调用 loadGraphToView。
     *     2. 创建后立即保存到 localStorage 并注册到 registry。
     *
     * 参数：
     *
     *     title — 根图名称
     *     opts  — 可选。opts.id 指定固定 GraphId（幂等——已存在则跳过创建）。
     *             dev 种子数据（bootstrap）用它保证跨图引用（sourceGraphId）指向稳定 ID；
     *             生产路径（Graph.vue / NavigationPanel）不传，走随机 ID。
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
     * 说明：
     *
     *     按 ID 从多图注册表中查找图，供认知操作（diverge、induce）
     *     等跨图场景获取目标图。
     */
    function getGraphById(graphId: GraphId): GraphData | undefined {
        return lookupGraph(graphRegistry.value, graphId)
    }

    /**
     * 说明：
     *
     *     将 Runtime 持有的 graphRegistry 包装为引擎 compose 层所需的
     *     纯查询函数 (graphId) → GraphData | undefined，供 induce /
     *     internalize / diverge 跨图查询使用。
     */
    function makeLookup(): GraphLookup {
        return (graphId: GraphId): GraphData | undefined => lookupGraph(graphRegistry.value, graphId)
    }

    /**
     * 说明：
     *
     *     清除上一次操作的校验结果。供 UI 层在切换模式/工具/操作、
     *     关闭浮空窗时调用，确保用户不会看到已过期的校验错误消息。
     */
    function clearValidationResult() {
        lastValidationResult.value = null
    }
    
    function deleteAndUnregisterGraph(graphId: GraphId): void {
        deleteGraph(graphId)
        unregisterGraph(graphRegistry.value, graphId)
    }

    /**
     * 说明：
     *
     *     列出 localStorage 中全部根图谱的摘要，供 GraphNavigationCard 展示与切换。
     *
     * 调用契约：
     *
     *     1. 本函数不修改任何运行时状态。
     *
     * 代码修改契约：
     *
     *     1. 数据来自持久化全量扫描，不经过 graphRegistry——
     *        registry 只持有当前根图树，无法覆盖全部根图。
     *
     * TODO：
     *
     *     排序依据待后续开发稳定后确定——图级 updatedAt 引擎已维护，
     *     是否改用最近更新排序（而非 title 字典序）待定。
     */
    function listRootGraphInfos(): RootGraphInfo[] {
        const infos: RootGraphInfo[] = []

        for (const graphId of listRootGraphIds()) {
            const graph = loadGraph(graphId)
            if (!graph) continue
            infos.push({ id: graph.id, title: graph.title, updatedAt: graph.updatedAt })
        }

        return infos.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    }

    /**
     * 说明：
     *
     *     删除一个根图及其全部子孙子图（级联删除整棵图树），
     *     供 GraphNavigationCard 根图谱列表删除按钮使用。
     *
     * 调用契约：
     *
     *     1. 若 rootId 为当前视图所在根图，直接返回不删除——
     *        删除活跃根图会使视图失去持久化副本。
     *
     * 代码修改契约：
     *
     *     1. 通过 isInRootTree 判定归属，防止只删根图留下孤儿子图
     *        污染 listSavedGraphIds 的全量扫描结果。
     *
     * 参数：
     *
     *     rootId — 要删除的根图 ID，与其全部子孙子图一并删除。
     */
    function deleteRootGraphTree(rootId: GraphId): void {
        // 防御：禁止删除当前视图所在的根图。
        const currentRootId = graphPath.value[0]
        if (currentRootId !== undefined && currentRootId === rootId) {
            return
        }

        // 收集整棵树的成员。
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

        // 收集完后，统一删除
        for (const graphId of treeIds) {
            deleteAndUnregisterGraph(graphId)
        }

        if (loadLastActiveRootId() === rootId) {
            clearLastActiveRootId()
        }
    }

    /**
     * 说明：
     *
     *     对单个目标图执行批量操作，是 commitBatchToGraphs 的单图便捷包装。
     *     事务、undo snapshot 与持久化行为全部继承自 commitBatchToGraphs。
     *
     * 参数：
     *
     *     targetGraph — 要操作的目标图
     *     operations  — 操作序列
     */
    function commitBatchToGraph(
        targetGraph: GraphData,
        operations: GraphOperation[],
    ): { validation: ValidationResult } {
        const result = commitBatchToGraphs(
            [{ graph: targetGraph, operations }],
        )
        lastValidationResult.value = result.validation

        return result
    }

    /**
     * 说明：
     *
     *     对多个目标图批量执行操作，是全部图写入的统一入口。
     *     执行按照四阶段：逐项 applyBatch 执行 → 成功后统一提交状态 → 兑现 add_graph / delete_graph 信号
     *     → 统一持久化。
     *
     * 调用契约：
     *
     *     1. 任一项执行失败即整批返回，不产生部分提交。
     *     2. 同一图可在 operationBatch 中出现多次，后续项以前一项的结果图为输入。
     *     3. 全部成功后统一持久化所有结果图。
     *
     * 代码修改契约：
     *
     *     1. add_graph / delete_graph 为引擎静默信号，由本函数兑现为 registry 与持久化副作用。
     *
     * TODO：
     *
     *     undo snapshot 当前在批量提交前对 graphView 只拍一次（一次批量 = 一次撤销）。
     *     该粒度语义是否成立，待 undo 接入引擎 OperationLog 后统一确定，届时本函数
     *     的快照逻辑随之调整。
     *
     * 参数：
     *
     *     operationBatch — 图与其对应的操作序列的配对数组
     */
    function commitBatchToGraphs(
        operationBatch: { graph: GraphData; operations: GraphOperation[] }[],
    ): { validation: ValidationResult } {

        // TODO：空批守卫为冗余分支——删除后空批走正常路径产出完全相同
        // （所有循环对空输入天然安全，尾部 validation 同样为 { valid: true, issues: [] }）。
        // 待确认无依赖后移除。
        if (operationBatch.length === 0) {
            const emptyValidation: ValidationResult = { valid: true, issues: [] }
            lastValidationResult.value = emptyValidation
            return { validation: emptyValidation }
        }

        // 第一阶段：按顺序执行所有项，用 latestGraphs 跟踪同一图的中间状态
        const latestGraphs = new Map<GraphId, GraphData>()
        const allIssues = []

        for (const item of operationBatch) {
            const inputGraph = latestGraphs.get(item.graph.id) ?? item.graph
            const { graph: resultGraph, validation } = applyBatch(inputGraph, item.operations)

            if (!validation.valid) {
                lastValidationResult.value = validation

                return { validation }
            }

            latestGraphs.set(item.graph.id, resultGraph)
            allIssues.push(...validation.issues)
        }

        // 全部成功后：为 graphView 拍 undo snapshot（只拍一次，记录批量操作前状态）。
        // 所有修改 GraphData 的操作都需要撤销支持。
        const hasGraphViewTarget = operationBatch.some(item => item.graph.id === graphView.value?.id)
        const needsUndoSnapshot = hasGraphViewTarget
            && operationBatch.some(item => item.operations.some((op) => {
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
            // 快照入栈：JSON 序列化而非 structuredClone——Pinia reactive proxy 无法被 structuredClone。
            // 入栈后截断到 MAX_UNDO_STACK_SIZE。
            const snapshot: GraphData = JSON.parse(JSON.stringify(graphView.value))
            undoStack.value = [...undoStack.value, snapshot].slice(-MAX_UNDO_STACK_SIZE)
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
        for (const item of operationBatch) {
            for (const operation of item.operations) {
                if (operation.type === 'add_graph') {
                    registerGraph(graphRegistry.value, operation.graph)
                    saveGraph(operation.graph)
                }

                if (operation.type === 'delete_graph') {
                    unregisterGraph(graphRegistry.value, operation.graphId)
                    deleteGraph(operation.graphId)
                }
            }
        }

        // 第四阶段：统一持久化结果图
        for (const resultGraph of latestGraphs.values()) {
            saveGraph(resultGraph)
        }

        // 若当前视图图被持久化，记录最近一次保存时间。
        if (hasGraphViewTarget) {
            lastSaveTime.value = Date.now()
        }

        const validation: ValidationResult = {
            valid: true,
            issues: allIssues,
        }

        lastValidationResult.value = validation

        return { validation }
    }

    /**
     * 说明：
     *
     *     撤销最近一次操作：弹出撤销栈顶部快照并恢复为当前图。
     *
     * 调用契约：
     *
     *     1. 恢复完整 GraphData Snapshot。
     *     2. 覆盖所有修改操作（add / delete / update / move / fold / expand）。
     *     3. 刷新网页后 Undo 自动失效（快照不持久化）。
     *
     * TODO：
     *
     *     未来接入引擎 OperationLog（Event Sourcing）后，本函数将改为
     *     基于 replay 的回放式撤销，届时快照栈可移除。当前施工进度未到，
     *     暂以快照式实现占位，且尚未接线 UI 入口。
     */
    function undo(): boolean {
        const previousGraph = undoStack.value.pop()

        if (!previousGraph) {
            return false
        }
        graphView.value = previousGraph

        return true
    }

    /**
     * 说明：
     *
     *     沿 parentGraphId 回溯构建从给定图到根图的完整路径（根→叶），
     *     返回末端图（根图或链断裂处）供调用方做断链检测。
     *
     * 调用契约：
     *
     *     祖先图不在 registry 时从持久化惰性加载并注册。
     */
    function buildGraphPath(graph: GraphData): { path: GraphId[]; terminal: GraphData } {
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

        return { path, terminal: currentGraph }
    }

    /**
     * 说明：
     *
     *     沿 parentGraphId 链回溯，判断 graph 是否属于指定根图树。
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
        deleteAndUnregisterGraph,
        listRootGraphInfos,
        deleteRootGraphTree,
        commitBatchToGraph,
        commitBatchToGraphs,
        undo,
    }
})
