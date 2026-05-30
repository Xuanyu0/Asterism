/**
 * graph_store.ts
 *
 * 功能：
 * 使用 Pinia 管理知识图谱 GraphData 状态，并统一执行图操作。
 *
 * 总体结构：
 * 1. currentGraph：当前正在浏览 / 编辑的图
 * 2. selectedNodeId / selectedEdgeId：当前选中对象
 * 3. graphPath：当前图路径
 * 4. undoStack：删除操作的临时撤销栈
 * 5. applyOperation：统一接收 Operation，先校验再执行
 *
 * 外部如何使用：
 * import { useGraphStore } from '@/stores/graph_store'
 * const graphStore = useGraphStore()
 * graphStore.setCurrentGraph(mockGraph)
 * graphStore.applyOperation(operation)
 */

import { defineStore } from 'pinia'
import type { EdgeId, GraphData, GraphId, NodeId } from '@/definitions/types/graph_types'
import type { GraphOperation } from '@/definitions/types/graph_operation_types'
import { OperationValidator } from '@/definitions/validators/operation_validator'
import type { ValidationResult } from '@/definitions/types/validation_types'
import {
    saveGraph,
    loadGraph,
    deleteGraph
} from '@/graph/graph_persistence'


const MAX_UNDO_STACK_SIZE = 20    // 删除撤销栈最大数量，避免长时间操作后占用过多内存

export interface GraphStoreState {
    currentGraph: GraphData | null    // 当前正在浏览或编辑的图
    selectedNodeId: NodeId | null    // 当前选中的节点 id
    selectedEdgeId: EdgeId | null    // 当前选中的边 id
    graphPath: GraphId[]    // 当前图路径，用于子图逐级返回
    lastValidationResult: ValidationResult | null    // 最近一次操作校验结果
    undoStack: GraphData[]    // 删除操作撤销栈，刷新网页后自然清空
    lastSaveTime: number | null    // 最近一次成功保存当前图谱的时间戳
}

export const useGraphStore = defineStore('graph_store', {
    state: (): GraphStoreState => ({
        currentGraph: null,    // 初始没有图数据
        selectedNodeId: null,    // 初始没有选中节点
        selectedEdgeId: null,    // 初始没有选中边
        graphPath: [],    // 初始路径为空
        lastValidationResult: null,    // 初始没有校验结果
        undoStack: [],    // 初始没有可撤销状态
        lastSaveTime: null as number | null,
    }),

    actions: {
        setCurrentGraph(graph: GraphData) {
            this.currentGraph = this.normalizeGraph(graph)    // 设置当前图，并补齐运行时默认字段
            this.graphPath = [graph.id]    // 初始化图路径
            this.selectedNodeId = null    // 切图后清空节点选择
            this.selectedEdgeId = null    // 切图后清空边选择
            this.lastValidationResult = null    // 切图后清空校验结果
            this.undoStack = []    // 切图后清空删除撤销栈
        },

        /**
         * 功能：
         *     保存当前图谱到本地持久化存储。
         *
         * 规则：
         *     1. 当前必须存在 currentGraph。
         *     2. 保存单位是完整 GraphData。
         *     3. 保存成功后记录保存时间。
         *     4. 不修改 currentGraph 内容。
         *
         * 使用：
         *     graphStore.saveCurrentGraph()
         */
        saveCurrentGraph(): void {
            if (!this.currentGraph) {
                return
            }

            saveGraph(this.currentGraph)

            this.lastSaveTime = Date.now()
        },

        /**
         * 功能：
         *     从本地持久化存储加载图谱，并替换当前图谱。
         *
         * 规则：
         *     1. 找不到对应 GraphData 时不修改 currentGraph。
         *     2. 加载成功后直接替换 currentGraph。
         *     3. 加载成功后清空选中状态。
         *     4. 加载成功后清空删除撤销栈。
         *     5. 本函数不负责完整图校验。
         *
         * 使用：
         *     const success = graphStore.loadGraphToCurrent(graphId)
         */
        loadGraphToCurrent(graphId: GraphId): boolean {
            const graph = loadGraph(graphId)

            if (!graph) {
                return false
            }

            this.currentGraph = graph
            this.selectedNodeId = null
            this.selectedEdgeId = null
            this.undoStack = []

            return true
        },

        /**
         * 功能：
         *     删除本地持久化中的图谱数据。
         *
         * 规则：
         *     1. 不影响当前运行中的 currentGraph。
         *     2. 只删除本地存储中的记录。
         *     3. 如果删除的是当前图谱的持久化副本，当前内存中的图谱仍然保留。
         *
         * 使用：
         *     graphStore.deleteSavedGraph(graphId)
         */
        deleteSavedGraph(graphId: GraphId): void {
            deleteGraph(graphId)
        },


        selectNode(nodeId: NodeId | null) {
            this.selectedNodeId = nodeId    // 设置当前选中节点
            this.selectedEdgeId = null    // 选中节点时取消选中边
        },

        selectEdge(edgeId: EdgeId | null) {
            this.selectedEdgeId = edgeId    // 设置当前选中边
            this.selectedNodeId = null    // 选中边时取消选中节点
        },

        clearSelection() {
            this.selectedNodeId = null    // 清空节点选择
            this.selectedEdgeId = null    // 清空边选择
        },

        undoDelete(): boolean {
            const previousGraph = this.undoStack.pop()    // 取出最近一次删除前的完整图状态

            if (!previousGraph) {
                return false    // 没有可撤销状态时直接返回失败
            }

            this.currentGraph = previousGraph    // 恢复删除前的 GraphData
            this.selectedNodeId = null    // 撤销后清空节点选择
            this.selectedEdgeId = null    // 撤销后清空边选择

            return true
        },

        applyOperation(operation: GraphOperation): ValidationResult {
            if (!this.currentGraph) {
                const result: ValidationResult = {
                    valid: false,
                    issues: [{
                        level: 'error',
                        code: 'CURRENT_GRAPH_NOT_FOUND',
                        message: '当前没有可操作的知识图谱。',
                        targetType: 'graph',
                    }],
                }    // 没有当前图时返回错误

                this.lastValidationResult = result    // 保存校验结果

                return result
            }

            const result = OperationValidator.validateOperation(this.currentGraph, operation)    // 操作前局部校验
            this.lastValidationResult = result    // 保存校验结果

            if (!result.valid) {
                return result    // 校验不通过则不修改图数据
            }

            if (this.shouldPushUndoSnapshot(operation)) {
                this.pushUndoSnapshot(this.currentGraph)    // 删除前保存完整图状态，用于 CTRL + Z 撤销
            }

            this.currentGraph = this.applyOperationToGraph(this.currentGraph, operation)    // 校验通过后执行操作

            return result
        },

        // ------------------------------private section

        privateApplyAddNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'add_node' }>): GraphData {
            console.log(
                'Add Node Position:',
                operation.node.position
            )

            return {
                ...graph,
                nodes: [...graph.nodes, operation.node],
                updatedAt: new Date().toISOString(),
            }    // 返回添加节点后的新图
        },

        privateApplyAddEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'add_edge' }>): GraphData {
            return {
                ...graph,
                edges: [...graph.edges, operation.edge],
                updatedAt: new Date().toISOString(),
            }    // 返回添加边后的新图
        },

        privateApplyDeleteNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'delete_node' }>): GraphData {
            return this.cleanGraphAfterDeleteNode({
                ...graph,
                nodes: graph.nodes.filter(node => node.id !== operation.nodeId),
                edges: graph.edges.filter(edge => edge.source !== operation.nodeId && edge.target !== operation.nodeId),
                updatedAt: new Date().toISOString(),
            }, operation.nodeId)    // 删除节点时同时删除相关边，并清理折叠认知状态
        },

        privateApplyDeleteEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'delete_edge' }>): GraphData {
            return {
                ...graph,
                edges: graph.edges.filter(edge => edge.id !== operation.edgeId),
                updatedAt: new Date().toISOString(),
            }    // 返回删除边后的新图
        },

        privateApplyUpdateNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'update_node' }>): GraphData {
            return {
                ...graph,
                nodes: graph.nodes.map(node => node.id === operation.node.id ? operation.node : node),
                updatedAt: new Date().toISOString(),
            }    // 返回更新节点后的新图
        },

        privateApplyUpdateEdge(graph: GraphData, operation: Extract<GraphOperation, { type: 'update_edge' }>): GraphData {
            return {
                ...graph,
                edges: graph.edges.map(edge => edge.id === operation.edge.id ? operation.edge : edge),
                updatedAt: new Date().toISOString(),
            }    // 返回更新边后的新图
        },

        privateApplyMoveNode(graph: GraphData, operation: Extract<GraphOperation, { type: 'move_node' }>): GraphData {
            return {
                ...graph,
                nodes: graph.nodes.map(node => node.id === operation.nodeId ? {
                    ...node,
                    position: operation.position,
                } : node),
                updatedAt: new Date().toISOString(),
            }    // 拖动结束后将节点位置写回 GraphData
        },

        privateApplyCollapseDependency(graph: GraphData, operation: Extract<GraphOperation, { type: 'collapse_dependency' }>): GraphData {
            const foldedNodeIds = this.collectDependencyNodeIds(graph, operation.targetNodeId)    // 计算目标节点前置依赖节点

            if (foldedNodeIds.length === 0) {
                return graph    // 没有可折叠依赖时不修改图状态
            }

            const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }    // 兼容旧图数据
            const otherFoldedDependencies = currentCognitiveState.foldedDependencies.filter(item => item.targetNodeId !== operation.targetNodeId)    // 同一目标节点只保留一个折叠状态

            return {
                ...graph,
                cognitiveState: {
                    ...currentCognitiveState,
                    foldedDependencies: [
                        ...otherFoldedDependencies,
                        {
                            targetNodeId: operation.targetNodeId,
                            foldedNodeIds,
                        },
                    ],
                },
                updatedAt: new Date().toISOString(),
            }    // 将折叠状态作为认知状态持久化
        },

        privateApplyExpandDependency(graph: GraphData, operation: Extract<GraphOperation, { type: 'expand_dependency' }>): GraphData {
            const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }    // 兼容旧图数据

            return {
                ...graph,
                cognitiveState: {
                    ...currentCognitiveState,
                    foldedDependencies: currentCognitiveState.foldedDependencies.filter(item => item.targetNodeId !== operation.targetNodeId),
                },
                updatedAt: new Date().toISOString(),
            }    // 展开时移除对应目标节点的折叠认知状态
        },

        applyOperationToGraph(graph: GraphData, operation: GraphOperation): GraphData {
            switch (operation.type) {
                case 'add_node':
                    return this.privateApplyAddNode(graph, operation)    // 执行添加节点

                case 'add_edge':
                    return this.privateApplyAddEdge(graph, operation)    // 执行添加边

                case 'delete_node':
                    return this.privateApplyDeleteNode(graph, operation)    // 执行删除节点

                case 'delete_edge':
                    return this.privateApplyDeleteEdge(graph, operation)    // 执行删除边

                case 'update_node':
                    return this.privateApplyUpdateNode(graph, operation)    // 执行更新节点

                case 'update_edge':
                    return this.privateApplyUpdateEdge(graph, operation)    // 执行更新边

                case 'move_node':
                    return this.privateApplyMoveNode(graph, operation)    // 执行节点移动

                case 'collapse_dependency':
                    return this.privateApplyCollapseDependency(graph, operation)    // 执行依赖折叠

                case 'expand_dependency':
                    return this.privateApplyExpandDependency(graph, operation)    // 执行依赖展开

                default:
                    return graph    // 认知操作暂不在这里修改 GraphData
            }
        },

        shouldPushUndoSnapshot(operation: GraphOperation): boolean {
            return operation.type === 'delete_node' || operation.type === 'delete_edge'    // MVP 阶段 CTRL + Z 只撤销删除
        },

        pushUndoSnapshot(graph: GraphData) {
            const snapshot = structuredClone(graph)    // 保存删除前完整 GraphData

            this.undoStack = [...this.undoStack, snapshot].slice(-MAX_UNDO_STACK_SIZE)    // 限制撤销栈长度
        },

        normalizeGraph(graph: GraphData): GraphData {
            return {
                ...graph,
                cognitiveState: graph.cognitiveState ?? {
                    foldedDependencies: [],
                },
            }    // 补齐 GraphData 的认知状态默认值
        },

        cleanGraphAfterDeleteNode(graph: GraphData, deletedNodeId: NodeId): GraphData {
            const currentCognitiveState = graph.cognitiveState ?? { foldedDependencies: [] }    // 兼容旧图数据

            return {
                ...graph,
                cognitiveState: {
                    ...currentCognitiveState,
                    foldedDependencies: currentCognitiveState.foldedDependencies
                        .filter(item => item.targetNodeId !== deletedNodeId)
                        .map(item => ({
                            ...item,
                            foldedNodeIds: item.foldedNodeIds.filter(nodeId => nodeId !== deletedNodeId),
                        }))
                        .filter(item => item.foldedNodeIds.length > 0),
                },
            }    // 删除节点后清理失效的折叠状态
        },

        collectDependencyNodeIds(graph: GraphData, targetNodeId: NodeId): NodeId[] {
            const visitedNodeIds = new Set<NodeId>()    // 已经访问过的前置节点
            const stack: NodeId[] = [targetNodeId]    // 从目标节点反向搜索有向实边前置依赖

            while (stack.length > 0) {
                const currentNodeId = stack.pop()

                if (!currentNodeId) {
                    continue
                }

                const incomingDependencyEdges = graph.edges.filter(edge =>
                    edge.target === currentNodeId &&
                    edge.kind === 'real' &&
                    edge.direction === 'directed',
                )    // 只沿有向实边向前搜索依赖

                for (const edge of incomingDependencyEdges) {
                    if (!visitedNodeIds.has(edge.source)) {
                        visitedNodeIds.add(edge.source)
                        stack.push(edge.source)
                    }
                }
            }

            visitedNodeIds.delete(targetNodeId)    // 防御性处理，避免目标节点被折叠

            return Array.from(visitedNodeIds)
        },
    },
})
