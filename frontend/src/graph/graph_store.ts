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

import { applyBatch } from '@my-project/graph-engine'
import { normalizeGraph } from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/utilities/graph_registry'
import { createRegistry, registerGraph, unregisterGraph, lookupGraph, hasGraph } from '@/graph/utilities/graph_registry'

import { saveGraph, loadGraph, deleteGraph, listSavedGraphIds } from '@/graph/utilities/graph_persistence'

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
     *     这是用户切换根图谱的唯一入口。负责 normalize + 状态重置，
     *     以及"从 localStorage 加载"和"写入 runtime registry"。
     *
     * 规则：
     *
     *     1. 找不到对应 GraphData 时不修改任何状态，返回 false。
     *     2. 加载成功后将图写入 registry（跨图操作可见）。
     *     3. 本函数不负责完整图校验。
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
            return false
        }

        // 读取时即设置当前显示的图谱
        graphView.value = normalizeGraph(graph)
        graphPath.value = [graph.id]
        lastValidationResult.value = null
        undoStack.value = []

        registerGraph(graphRegistry.value, graph)

        return true
    }

    /**
     * 功能：
     *
     *     扫描 localStorage 中全部已保存图谱，重建多图注册表。
     *
     * 规则：
     *
     *     1. 应用启动时调用一次。
     *     2. 注册表中的 GraphData 对象与 graphView 可能指向同一引用（同图时）。
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
        const savedIds = listSavedGraphIds()

        for (const graphId of savedIds) {
            if (hasGraph(graphRegistry.value, graphId)) continue

            const graph = loadGraph(graphId)

            if (graph) {
                registerGraph(graphRegistry.value, graph)
            }
        }
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
     *     graph_operations（induce / internalize / diverge 调用前构造 lookupGraph 参数）
     */
    function makeLookup(): GraphLookup {
        return (graphId: GraphId): GraphData | undefined => {
            return graphRegistry.value.get(graphId)
        }
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
        
        // 内部行为
        getGraphById,
        makeLookup,
        clearValidationResult,
        
        // 功能行为
        deleteSavedGraph,
        applyBatchToGraph,
        applyBatchToGraphs,
        undo,
    }
})
