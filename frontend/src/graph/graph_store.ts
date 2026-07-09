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
 *     2. selectedNodeId / selectedEdgeId  — 当前选中对象
 *     3. graphPath  — 当前图路径
 *     4. undoStack  — 全操作撤销栈（Step 12 将升级为 OperationLog）
 *     5. applyBatchToGraph / applyBatchToGraphs  — 所有图操作的唯一入口
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
 *     graphStore.setGraphView(mockGraph)
 *     graphStore.applyBatchToGraph(graph, [operation])
 *     graphStore.applyBatchToGraphs([
 *         { graph: parentGraph, operations: parentOps },
 *         { graph: childGraph, operations: childOps },
 *     ])
 */

import { defineStore } from 'pinia'

import type { EdgeId, GraphData, GraphId, GraphLookup, NodeId } from '@my-project/graph-engine'
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
 *     单图操作选项。
 */
export interface ApplyBatchToGraphOptions {
    /** 是否持久化结果图。默认 true。 */
    persist?: boolean
}

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
 *     多图批量操作选项。
 */
export interface ApplyBatchToGraphsOptions {
    /** 是否持久化所有结果图。默认 true。 */
    persist?: boolean
}

/**
 * 功能：
 *
 *     判断当前 Operation 是否需要保存 Undo Snapshot。
 *
 * 规则：
 *
 *     所有修改 GraphData 的操作都需要撤销支持。
 *
 * 消费者：
 *
 *     applyBatchToGraphs（undo snapshot）
 */
export function shouldPushUndoSnapshot(operation: GraphOperation): boolean {
    switch (operation.type) {
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

    /** 当前选中的节点 ID。 */
    selectedNodeId: NodeId | null

    /** 当前选中的边 ID。 */
    selectedEdgeId: EdgeId | null

    /** 当前图路径，用于子图逐级返回。 */
    graphPath: GraphId[]

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
 *     1. state  — 当前图数据、选中状态、撤销栈
 *     2. actions  — 图操作入口（setGraphView / applyBatchToGraph / applyBatchToGraphs / undoDelete 等）
 *
 * 规则：
 *
 *     1. Draft 数据与 Cytoscape Runtime 禁止进入本 Store。
 *     2. UI Runtime 必须通过 operation_controller 间接调用本 Store。
 *     3. 所有修改委托引擎 applyBatch 执行 validate + execute。
 *
 * 使用：
 *
 *     import { useGraphStore } from '@/graph/graph_store'
 *     const graphStore = useGraphStore()
 *     graphStore.setGraphView(graph)
 *     graphStore.applyBatchToGraph(graph, [operation])
 */
export const useGraphStore = defineStore('graph_store', {
    state: (): GraphStoreState => ({
        graphView: null,
        selectedNodeId: null,
        selectedEdgeId: null,
        graphPath: [],
        undoStack: [],
        lastSaveTime: null as number | null,
        graphRegistry: createRegistry(),
    }),

    actions: {
        /**
         * 功能：
         *
         *     设置当前视图图（内存原语，不持久化）。
         *
         *     这是 loadGraphToView 的内部委托——负责 normalize + 状态重置。
         *     外部调用方（测试、mock 加载）直接传 GraphData，跳过 localStorage。
         *     用户正常切换根图应走 loadGraphToView。
         *
         * 规则：
         *
         *     1. 替换 graphView 为新图（经 normalizeGraph 补齐默认值）。
         *     2. 重置 graphPath 为单元素 [graph.id]——新图无父图上下文。
         *     3. 清空 selectedNodeId / selectedEdgeId / undoStack。
         *     4. 不写 registry——调用方如需跨图可见应自行 registerGraph。
         *
         * 使用：
         *
         *     graphStore.setGraphView(graph)  // 仅测试 / mock
         *     graphStore.loadGraphToView(id)  // 用户正常操作
         *
         * 消费者：
         *
         *     loadGraphToView、test_runtime.ts、test_evaluation_machine.ts
         */
        setGraphView(graph: GraphData) {
            this.graphView = normalizeGraph(graph)
            this.graphPath = [graph.id]
            this.selectedNodeId = null
            this.selectedEdgeId = null
            this.undoStack = []
        },

        /**
         * 功能：
         *
         *     从持久化存储加载图谱，切换为当前视图图。
         *
         *     这是用户切换根图谱的唯一入口。内部委托 setGraphView 重置状态，
         *     额外负责"从 localStorage 加载"和"写入 runtime registry"。
         *
         * 规则：
         *
         *     1. 找不到对应 GraphData 时不修改任何状态，返回 false。
         *     2. 加载成功后将图写入 registry（跨图操作可见）。
         *     3. 状态重置（graphView / graphPath / 选中 / undoStack）委托 setGraphView。
         *     4. 本函数不负责完整图校验。
         *
         * 使用：
         *
         *     const success = graphStore.loadGraphToView(graphId)
         *     // 未来由图谱列表 UI 调用
         *
         * 消费者：
         *
         *     main.ts / 图谱列表 UI（待实现）
         */
        loadGraphToView(graphId: GraphId): boolean {
            const graph = loadGraph(graphId)

            if (!graph) {
                return false
            }

            this.setGraphView(graph)
            registerGraph(this.graphRegistry, graph)

            return true
        },

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
        deleteSavedGraph(graphId: GraphId): void {
            deleteGraph(graphId)
            unregisterGraph(this.graphRegistry, graphId)
        },

        /**
         * 功能：
         *
         *     设置当前选中节点。
         *
         * 规则：
         *
         *     1. 属于 Runtime UI 状态。
         *     2. 不修改 GraphData。
         *     3. 不参与持久化。
         */
        selectNode(nodeId: NodeId | null) {
            this.selectedNodeId = nodeId
            this.selectedEdgeId = null
        },

        /**
         * 功能：
         *
         *     设置当前选中边。
         *
         * 规则：
         *
         *     1. 属于 Runtime UI 状态。
         *     2. 不修改 GraphData。
         *     3. 不参与持久化。
         */
        selectEdge(edgeId: EdgeId | null) {
            this.selectedEdgeId = edgeId
            this.selectedNodeId = null
        },

        clearSelection() {
            this.selectedNodeId = null
            this.selectedEdgeId = null
        },

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
        undoDelete(): boolean {
            const previousGraph = this.undoStack.pop()

            if (!previousGraph) {
                return false
            }

            this.graphView = previousGraph
            this.selectedNodeId = null
            this.selectedEdgeId = null

            return true
        },

        /**
         * 功能：
         *
         *     扫描 localStorage 中全部已保存图谱，重建多图注册表。
         *
         * 规则：
         *
         *     1. 应用启动时调用一次。
         *     2. 当前已加载的 graphView 也会被注册（若已通过 setGraphView 设置）。
         *     3. 注册表中的 GraphData 对象与 graphView 可能指向同一引用（同图时）。
         *
         * 使用：
         *
         *     graph_store 首次创建后，由 setGraphView 或 KnowledgeGraph.vue onMounted 触发。
         *
         * 消费者：
         *
         *     KnowledgeGraph.vue onMounted
         */
        initRegistry(): void {
            const savedIds = listSavedGraphIds()

            for (const graphId of savedIds) {
                if (hasGraph(this.graphRegistry, graphId)) continue

                const graph = loadGraph(graphId)

                if (graph) {
                    registerGraph(this.graphRegistry, graph)
                }
            }

            // 当前已加载的图可能尚未持久化（例如 mock 数据），也注册进去
            if (this.graphView && !hasGraph(this.graphRegistry, this.graphView.id)) {
                registerGraph(this.graphRegistry, this.graphView)
            }
        },

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
        getGraphById(graphId: GraphId): GraphData | undefined {
            return lookupGraph(this.graphRegistry, graphId)
        },

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
        makeLookup(): GraphLookup {
            return (graphId: GraphId): GraphData | undefined => {
                return this.graphRegistry.get(graphId)
            }
        },

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
         *     options     — [可选] persist 控制是否持久化
         *
         * 使用：
         *
         *     graphStore.applyBatchToGraph(graphView, [op])
         */
        applyBatchToGraph(
            targetGraph: GraphData,
            operations: GraphOperation[],
            options?: ApplyBatchToGraphOptions,
        ): { validation: ValidationResult } {
            return this.applyBatchToGraphs(
                [{ graph: targetGraph, operations }],
                options,
            )
        },

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
         *     options — [可选] persist 控制是否持久化
         *
         * 使用：
         *
         *     graphStore.applyBatchToGraphs([
         *         { graph: parentGraph, operations: parentOps },
         *         { graph: childGraph, operations: childOps },
         *     ])
         */
        applyBatchToGraphs(
            targets: ApplyBatchTarget[],
            options?: ApplyBatchToGraphsOptions,
        ): { validation: ValidationResult } {
            const persist = options?.persist ?? true

            if (targets.length === 0) {
                const emptyValidation: ValidationResult = { valid: true, issues: [] }

                return { validation: emptyValidation }
            }

            // 第一阶段：按顺序执行所有 target，用 latestGraphs 跟踪同一图的中间状态
            const latestGraphs = new Map<GraphId, GraphData>()
            const allIssues = []

            for (const target of targets) {
                const inputGraph = latestGraphs.get(target.graph.id) ?? target.graph
                const { graph: resultGraph, validation } = applyBatch(inputGraph, target.operations)

                if (!validation.valid) {
                    return { validation }
                }

                latestGraphs.set(target.graph.id, resultGraph)
                allIssues.push(...validation.issues)
            }

            // 全部成功后：为 graphView 拍 undo snapshot（只拍一次，记录批量操作前状态）
            const hasGraphViewTarget = targets.some(target => target.graph.id === this.graphView?.id)
            const needsUndoSnapshot = hasGraphViewTarget
                && targets.some(target => target.operations.some(shouldPushUndoSnapshot))

            if (needsUndoSnapshot && this.graphView) {
                this.undoStack = pushUndoSnapshot(this.undoStack, this.graphView)
            }

            // 第二阶段：全部成功后统一更新 state
            for (const [graphId, resultGraph] of latestGraphs) {
                // 同步更新 registry，保证 graphView 与 registry 中同图引用一致。
                // graphView 的图可能同时存在于 registry 中（例如通过 loadGraphToView 加载），
                // 只更新 graphView 会导致 registry 持有过期引用。
                registerGraph(this.graphRegistry, resultGraph)

                if (graphId === this.graphView?.id) {
                    this.graphView = resultGraph
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
                        registerGraph(this.graphRegistry, operation.graph)

                        if (persist) {
                            saveGraph(operation.graph)
                        }
                    }

                    if (operation.type === 'delete_graph') {
                        unregisterGraph(this.graphRegistry, operation.graphId)

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
                    this.lastSaveTime = Date.now()
                }
            }

            const validation: ValidationResult = {
                valid: true,
                issues: allIssues,
            }

            return { validation }
        },
    },
})
