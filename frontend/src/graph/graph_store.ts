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
 * import { useGraphStore } from '@/graph/graph_store'
 * const graphStore = useGraphStore()
 * graphStore.setCurrentGraph(mockGraph)
 * graphStore.applyOperation(operation)
 */

import { defineStore } from 'pinia'

import type { EdgeId, GraphData, GraphId, GraphRegistry, NodeId } from '@my-project/graph-engine'
import type { GraphOperation } from '@my-project/graph-engine'
import { createRegistry, registerGraph, unregisterGraph, getGraph, hasGraph } from '@my-project/graph-engine'
import { OperationValidator } from '@/definitions/validators/operation_validator'
import type { ValidationResult } from '@my-project/graph-engine'

import { saveGraph, loadGraph, deleteGraph, listSavedGraphIds } from '@/graph/utilities/graph_persistence'
import { applyOperationToGraph, pushUndoSnapshot, shouldPushUndoSnapshot } from '@/graph/utilities/operation_executor'
import { normalizeGraph } from '@/graph/utilities/graph_utils'


/**
 * 功能：
 *     Graph Runtime 状态定义。
 *
 * 规则：
 *     1. currentGraph 是唯一事实源。
 *     2. Draft 数据禁止进入本 Store。
 *     3. Cytoscape Runtime 禁止进入本 Store。
 */
export interface GraphStoreState {
    currentGraph: GraphData | null    // 当前正在浏览或编辑的图
    selectedNodeId: NodeId | null    // 当前选中的节点 id
    selectedEdgeId: EdgeId | null    // 当前选中的边 id
    graphPath: GraphId[]    // 当前图路径，用于子图逐级返回
    lastValidationResult: ValidationResult | null    // 最近一次操作校验结果
    undoStack: GraphData[]    // 删除操作撤销栈，刷新网页后自然清空
    lastSaveTime: number | null    // 最近一次成功保存当前图谱的时间戳
    registry: GraphRegistry    // 多图注册表，由 localStorage 中全部已保存 GraphData 重建的运行时索引
}

/**
 * 功能：
 *     创建 Graph Store 实例，管理 GraphData 状态与图操作。
 *     GraphData 唯一事实源，所有图数据修改必须经过本 Store。
 *
 * 总体结构：
 *     1. state: GraphStoreState — 当前图数据、选中状态、撤销栈
 *     2. actions: 图操作入口（setCurrentGraph / applyOperation / saveCurrentGraph / undoDelete 等）
 *
 * 规则：
 *     1. Draft 数据与 Cytoscape Runtime 禁止进入本 Store。
 *     2. UI Runtime 必须通过 operation_controller 间接调用本 Store。
 *     3. 所有修改先执行 OperationValidator 校验，通过后才允许。
 *
 * 使用：
 *     import { useGraphStore } from '@/graph/graph_store'
 *     const graphStore = useGraphStore()
 *     graphStore.setCurrentGraph(graph)
 *     graphStore.applyOperation(operation)
 */
export const useGraphStore = defineStore('graph_store', {
    state: (): GraphStoreState => ({
        currentGraph: null,    // 初始没有图数据
        selectedNodeId: null,    // 初始没有选中节点
        selectedEdgeId: null,    // 初始没有选中边
        graphPath: [],    // 初始路径为空
        lastValidationResult: null,    // 初始没有校验结果
        undoStack: [],    // 初始没有可撤销状态
        lastSaveTime: null as number | null,
        registry: createRegistry(),    // 空注册表，由 initRegistry 填充
    }),

    actions: {
        setCurrentGraph(graph: GraphData) {
            this.currentGraph = normalizeGraph(graph)
            this.graphPath = [graph.id]
            this.selectedNodeId = null
            this.selectedEdgeId = null
            this.lastValidationResult = null
            this.undoStack = []
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
            registerGraph(this.registry, this.currentGraph)

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
            registerGraph(this.registry, graph)
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
            unregisterGraph(this.registry, graphId)
        },

        /**
         * 功能：
         *     设置当前选中节点。
         *
         * 规则：
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
         *     设置当前选中边。
         *
         * 规则：
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
         *     撤销最近一次删除操作。
         *
         * 规则：
         *     1. 恢复完整 GraphData Snapshot。
         *     2. MVP 阶段仅支持删除撤销。
         *     3. 刷新网页后 Undo 自动失效。
         */
        undoDelete(): boolean {
            const previousGraph = this.undoStack.pop()

            if (!previousGraph) {
                return false
            }

            this.currentGraph = previousGraph
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
         *     2. 当前已加载的 currentGraph 也会被注册（若已通过 setCurrentGraph 设置）。
         *     3. 注册表中的 GraphData 对象与 currentGraph 可能指向同一引用（同图时）。
         *
         * 使用：
         *
         *     graph_store 首次创建后，由 setCurrentGraph 或 KnowledgeGraph.vue onMounted 触发。
         */
        initRegistry(): void {
            const savedIds = listSavedGraphIds()

            for (const graphId of savedIds) {
                if (hasGraph(this.registry, graphId)) continue

                const graph = loadGraph(graphId)

                if (graph) {
                    registerGraph(this.registry, graph)
                }
            }

            // 当前已加载的图可能尚未持久化（例如 mock 数据），也注册进去
            if (this.currentGraph && !hasGraph(this.registry, this.currentGraph.id)) {
                registerGraph(this.registry, this.currentGraph)
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
         */
        getGraphById(graphId: GraphId): GraphData | undefined {
            return getGraph(this.registry, graphId)
        },

        /**
         * 功能：
         *
         *     将新图注册到多图注册表并持久化。
         *
         * 规则：
         *
         *     1. 认知操作创建新子图后调用。
         *     2. 同时写入 localStorage（saveGraph）和 Registry（registerGraph）。
         *     3. 若 graphId 已在 Registry 中则覆盖——调用方负责唯一性。
         *
         * 使用：
         *
         *     deconstruct / induce 在 applyBatch 执行后，由 operation_controller 调此函数
         *     将新建子图写入 Registry。
         */
        registerNewGraph(graph: GraphData): void {
            saveGraph(graph)
            registerGraph(this.registry, graph)
        },

        /**
         * 功能：
         *     Graph Runtime 唯一图结构修改入口。
         *
         * 规则：
         *     1. 所有 GraphData 修改必须经过本函数。
         *     2. 先执行 OperationValidator 校验。
         *     3. 校验通过后才允许修改 GraphData。
         *     4. 删除操作自动记录 Undo Snapshot。
         *
         * 使用：
         *     operation_controller.ts 调用本接口执行图操作。
         */
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
                }

                this.lastValidationResult = result

                return result
            }

            const result = OperationValidator.validateOperation(this.currentGraph, operation)
            this.lastValidationResult = result

            if (!result.valid) {
                return result
            }

            if (shouldPushUndoSnapshot(operation)) {
                this.undoStack = pushUndoSnapshot(this.undoStack, this.currentGraph)
            }

            this.currentGraph = applyOperationToGraph(this.currentGraph, operation)

            return result
        },
    },
})
