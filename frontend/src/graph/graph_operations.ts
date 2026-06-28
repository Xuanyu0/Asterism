/**
 * graph_operations.ts
 *
 * 功能：
 *
 *     图操作翻译层。接收 store 引用，实现所有具体的图操作函数。
 *     本文件是 engine compose / applyBatch / graphStore.applyOperation 在前端的唯一调用点
 *     （除 graph_store.applyOperation 内部委托外）。
 *
 * 总体结构：
 *
 *     1. 认知操作  — deconstruct / induce / internalize / diverge / unearth / explore
 *     2. 添加操作  — confirmDraftNode / targetNodeForEdge
 *     3. 删除操作  — executeDeleteNode / executeDeleteEdge / confirmDelete / cancelDelete / targetNodeForDelete / targetEdgeForDelete
 *     4. 折叠操作  — toggleFold
 *     5. 编辑操作  — confirmExistingNodeEdit / confirmExistingEdgeEdit / closeFloatingWindow
 *     6. 布局操作  — moveNode / computeNodeRadiusOverrides
 *     7. 草稿操作  — updateDraftNode / cancelDraftNode
 *     8. 辅助      — findCommonLayer
 *
 * 规则：
 *
 *     1. 所有函数签名：(store refs, ...params) → void。
 *     2. 错误通过 uiStore.lastOperationValidation 侧通道返回。
 *     3. 认知操作统一模式：compose → 判 issues → applyBatch 逐图提交。
 *     4. 本文件不操作 Cytoscape 实例。
 *     5. 本文件不负责 UI 状态路由——路由逻辑在 operation_controller。
 *
 * 外部如何使用：
 *
 *     operation_controller.ts 调本文件的函数执行图操作。
 */

import type {
    EdgeData,
    NodeData,
    NodeId,
    EdgeId,
    GraphData,
    NodeRadiusMap,
} from '@my-project/graph-engine'
import type { DraftNode } from '@/definitions/types/draft_types'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'
import { useDraftStore } from '@/ui/draft_store'

import { generateNodeId, generateEdgeId } from '@my-project/graph-engine'
import { applyBatch } from '@my-project/graph-engine'
import { DEFAULT_LAYOUT_RULES } from '@my-project/graph-engine'

// compose — arrangement
import { moveNode as composeMoveNode } from '@my-project/graph-engine'
// compose — cognitive
import { deconstruct as composeDeconstruct } from '@my-project/graph-engine'
import { induce as composeInduce } from '@my-project/graph-engine'
import { internalize as composeInternalize } from '@my-project/graph-engine'
import { diverge as composeDiverge } from '@my-project/graph-engine'

export function useGraphOperations() {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
    const draftStore = useDraftStore()

    // ── 认知操作 ──

    /**
     * 功能：
     *
     *     探索——开始新一轮学习。
     *
     * 规则：
     *
     *     Phase 3 AI Runtime 实现。引擎暂无对应 compose 函数。
     */
    function explore(): void {
        // TODO: Phase 3 — AI Runtime 单轮学习入口
    }

    /**
     * 功能：
     *
     *     发掘——对虚节点或无向虚边开启学习。
     *
     * 规则：
     *
     *     Phase 3 AI Runtime 实现。引擎暂无对应 compose 函数。
     */
    function unearth(_targetNodeId?: NodeId, _targetEdgeId?: EdgeId): void {
        // TODO: Phase 3 — AI Runtime 发掘入口
    }

    /**
     * 功能：
     *
     *     解构——单个原子实节点转换为抽象节点 + 空子图 + 沟通节点。
     *
     * 规则：
     *
     *     1. 委托引擎 composeDeconstruct 产出 operations。
     *     2. applyBatch 统一提交。
     *     3. 若创建了新子图，注册到 Registry 并持久化。
     *
     * 消费者：
     *
     *     operation_controller（Cognition 按钮）
     */
    function deconstruct(nodeId: NodeId): void {
        if (!graphStore.currentGraph || !nodeId) {
            return
        }

        const result = composeDeconstruct({
            nodeId,
            parentGraph: graphStore.currentGraph,
        })

        if (result.issues.some(issue => issue.severity === 'error')) {
            uiStore.lastOperationValidation = {
                valid: false,
                issues: result.issues.map(issue => ({
                    level: issue.severity,
                    code: 'COMPOSE_ISSUE',
                    message: issue.message,
                    targetType: 'node' as const,
                    targetId: nodeId,
                })),
            }

            return
        }

        const batchResult = applyBatch(graphStore.currentGraph, result.operations)
        uiStore.lastOperationValidation = batchResult.validation

        if (batchResult.validation.valid) {
            graphStore.currentGraph = batchResult.graph

            // 解构创建的子图已通过 add_graph 操作注册到 Registry。
            // 将新子图持久化到 localStorage。
            for (const op of result.operations) {
                if (op.type === 'add_graph') {
                    graphStore.registerNewGraph(op.graph)
                }
            }
        }
    }

    /**
     * 功能：
     *
     *     归纳——多个节点聚合为抽象节点 + 子图 + 沟通节点。
     *
     * 规则：
     *
     *     1. 委托引擎 composeInduce 产出跨图 operations。
     *     2. applyBatch 逐图提交。
     *     3. 归纳创建的子图注册并持久化。
     *
     * 消费者：
     *
     *     operation_controller（Cognition 按钮）
     */
    function induce(nodeIds: NodeId[]): void {
        if (!graphStore.currentGraph || nodeIds.length < 2) {
            return
        }

        const result = composeInduce({
            nodeIds,
            parentGraph: graphStore.currentGraph,
            lookupGraph: graphStore.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(graphStore.currentGraph),
            allEdges: graphStore.currentGraph.edges,
        })

        if (result.issues.some(issue => issue.severity === 'error')) {
            uiStore.lastOperationValidation = {
                valid: false,
                issues: result.issues.map(issue => ({
                    level: issue.severity,
                    code: 'COMPOSE_ISSUE',
                    message: issue.message,
                    targetType: 'graph' as const,
                })),
            }

            return
        }

        if (result.operations.parent.length > 0) {
            const parentBatch = applyBatch(graphStore.currentGraph, result.operations.parent)
            uiStore.lastOperationValidation = parentBatch.validation

            if (!parentBatch.validation.valid) {
                return
            }

            graphStore.currentGraph = parentBatch.graph
        }

        if (result.operations.child.length > 0) {
            const { childGraphData } = result as { childGraphData?: GraphData }

            if (childGraphData) {
                const childBatch = applyBatch(childGraphData, result.operations.child)

                if (childBatch.validation.valid) {
                    graphStore.registerNewGraph(childBatch.graph)
                }
            }
        }
    }

    /**
     * 功能：
     *
     *     内化——将知识节点从工作区转移至常识层。
     *
     * 规则：
     *
     *     1. 委托引擎 composeInternalize 产出跨图 operations。
     *     2. applyBatch 逐图提交。
     *     3. 当前 registry 中未找到常识层图时拒绝执行。
     *
     * 消费者：
     *
     *     operation_controller（Cognition 按钮）
     */
    function internalize(nodeIds: NodeId[]): void {
        if (!graphStore.currentGraph || nodeIds.length === 0) {
            return
        }

        const commonLayer = findCommonLayer(graphStore.graphRegistry)

        if (!commonLayer) {
            uiStore.lastOperationValidation = {
                valid: false,
                issues: [{
                    level: 'error',
                    code: 'COMMON_LAYER_NOT_FOUND',
                    message: '未找到常识层图谱，无法执行内化操作。',
                    targetType: 'graph',
                }],
            }

            return
        }

        const result = composeInternalize({
            nodeIds,
            parentGraph: graphStore.currentGraph,
            commonLayer,
            lookupGraph: graphStore.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(graphStore.currentGraph),
        })

        if (result.issues.some(issue => issue.severity === 'error')) {
            uiStore.lastOperationValidation = {
                valid: false,
                issues: result.issues.map(issue => ({
                    level: issue.severity,
                    code: 'COMPOSE_ISSUE',
                    message: issue.message,
                    targetType: 'graph' as const,
                })),
            }

            return
        }

        if (result.operations.parent.length > 0) {
            const parentBatch = applyBatch(graphStore.currentGraph, result.operations.parent)

            if (!parentBatch.validation.valid) {
                uiStore.lastOperationValidation = parentBatch.validation

                return
            }

            graphStore.currentGraph = parentBatch.graph
        }

        if (result.operations.commonLayer.length > 0) {
            const clBatch = applyBatch(commonLayer, result.operations.commonLayer)

            if (clBatch.validation.valid) {
                graphStore.registerNewGraph(clBatch.graph)
            }
        }

        uiStore.lastOperationValidation = { valid: true, issues: [] }
    }

    /**
     * 功能：
     *
     *     发散——在两个知识节点间创建有向虚边，跨图时自动创建启发节点并镜像。
     *
     * 规则：
     *
     *     1. 委托引擎 composeDiverge 产出跨图 operations。
     *     2. heuristicPosition 为 null 时两节点直连（同图）。
     *        heuristicPosition 非 null 时在点击位置创建启发节点（跨图）。
     *     3. applyBatch 逐图提交（current + peer）。
     *
     * 消费者：
     *
     *     operation_controller（Cognition 按钮）
     */
    function diverge(sourceNodeId: NodeId, targetNodeId: NodeId, heuristicPosition: { x: number; y: number } | null): void {
        if (!graphStore.currentGraph) {
            return
        }

        const result = composeDiverge({
            sourceNodeId,
            targetNodeId,
            currentGraph: graphStore.currentGraph,
            heuristicPosition,
            lookupGraph: graphStore.makeLookup(),
            graphIds: Array.from(graphStore.graphRegistry.keys()),
        })

        if (result.issues.some(issue => issue.severity === 'error')) {
            uiStore.lastOperationValidation = {
                valid: false,
                issues: result.issues.map(issue => ({
                    level: issue.severity,
                    code: 'COMPOSE_ISSUE',
                    message: issue.message,
                    targetType: 'graph' as const,
                })),
            }

            return
        }

        if (result.operations.current.length > 0) {
            const currentBatch = applyBatch(graphStore.currentGraph, result.operations.current)
            uiStore.lastOperationValidation = currentBatch.validation

            if (!currentBatch.validation.valid) {
                return
            }

            graphStore.currentGraph = currentBatch.graph
        }

        if (result.operations.peer.length > 0) {
            // 对端图：通过 registry 查找 peer 操作目标图
            for (const draft of result.drafts) {
                if ('graphId' in draft && draft.graphId !== graphStore.currentGraph?.id) {
                    const peerGraph = graphStore.getGraphById(draft.graphId)

                    if (peerGraph) {
                        const peerBatch = applyBatch(peerGraph, result.operations.peer)

                        if (peerBatch.validation.valid) {
                            graphStore.registerNewGraph(peerBatch.graph)
                        }
                    }
                }
            }
        }

        uiStore.lastOperationValidation = { valid: true, issues: [] }
    }

    /**
     * 功能：
     *
     *     在 Registry 中查找常识层图。
     */
    function findCommonLayer(graphRegistry: import('@/graph/utilities/graph_registry').GraphRegistry): GraphData | undefined {
        for (const [, graph] of graphRegistry) {
            if (graph.kind === 'commonLayer') {
                return graph
            }
        }

        return undefined
    }

    // ── 布局操作 ──

    /**
     * 功能：
     *
     *     单节点移动。委托引擎 moveNode compose 函数做碰撞检测并产出 operations。
     *
     * 规则：
     *
     *     1. 引擎 moveNode 纯函数——返回 { drafts, issues, operations }。
     *     2. 碰撞检测在引擎侧完成，前端根据 issues 判断是否可提交。
     *     3. 当前直接执行——草稿预览 UI 在 Phase 2b 实现。
     */
    function moveNode(nodeId: NodeId, position: { x: number; y: number }): void {
        if (!graphStore.currentGraph) {
            return
        }

        const result = composeMoveNode({
            nodeId,
            desiredPosition: position,
            allNodes: graphStore.currentGraph.nodes,
            nodeRadiusOverrides: computeNodeRadiusOverrides(graphStore.currentGraph),
        })

        if (result.issues.some(issue => issue.severity === 'error')) {
            uiStore.lastOperationValidation = {
                valid: false,
                issues: result.issues.map(issue => ({
                    level: issue.severity,
                    code: 'COMPOSE_ISSUE',
                    message: issue.message,
                    targetType: 'node' as const,
                    targetId: nodeId,
                })),
            }

            return
        }

        const batchResult = applyBatch(graphStore.currentGraph, result.operations)
        uiStore.lastOperationValidation = batchResult.validation

        if (batchResult.validation.valid) {
            graphStore.currentGraph = batchResult.graph
        }
    }

    /**
     * 功能：
     *
     *     计算当前图全部节点的外接圆半径。
     *
     * 规则：
     *
     *     半径公式 r = r₀ · √(1 + degree)。
     */
    function computeNodeRadiusOverrides(graph: GraphData): NodeRadiusMap {
        const map: NodeRadiusMap = new Map()

        for (const node of graph.nodes) {
            map.set(node.id, DEFAULT_LAYOUT_RULES.r0 * Math.sqrt(1 + node.degree))
        }

        return map
    }

    // ── 草稿操作 ──

    /**
     * 功能：
     *
     *     更新当前 DraftNode。
     *
     * 规则：
     *
     *     1. 只修改 Draft Runtime。
     *     2. 不进入 GraphData。
     */
    function updateDraftNode(patch: Partial<DraftNode>): void {
        draftStore.updateDraftNode(patch)
    }

    /**
     * 功能：
     *
     *     取消当前 DraftNode。
     *
     * 规则：
     *
     *     1. 只清理 Draft Runtime。
     *     2. 不影响 GraphData。
     */
    function cancelDraftNode(): void {
        draftStore.clearDraftNode()
    }

    /**
     * 功能：
     *
     *     确认当前 DraftNode，并转换为 add_node Operation。
     *
     * 规则：
     *
     *     1. label 为空时拒绝提交。
     *     2. DraftNode 不直接进入 GraphData。
     *     3. 只有 graphStore.applyOperation() 可以修改 GraphData。
     */
    function confirmDraftNode(): void {
        if (!draftStore.draftNode) {
            return
        }

        if (!graphStore.currentGraph) {
            return
        }

        const draftNode = draftStore.draftNode
        const label = draftNode.label.trim()

        if (!label) {
            return
        }

        const node: NodeData = {
            role: 'knowledge',
            id: generateNodeId(),
            graphId: graphStore.currentGraph.id,
            kind: draftNode.kind,
            form: draftNode.kind === 'real' ? 'atomic' : undefined,
            label,
            summary: draftNode.summary.trim(),
            abstractionLevel: 0,
            degree: 0,
            position: {
                x: draftNode.x,
                y: draftNode.y,
            },
        }

        const result = graphStore.applyOperation({
            type: 'add_node',
            node,
        })

        uiStore.lastOperationValidation = result

        if (result.valid) {
            draftStore.clearDraftNode()
        }
    }

    // ── 编辑操作（浮空窗确认） ──

    /**
     * 功能：
     *
     *     确认已有节点编辑，转换为 update_node Operation。
     *
     * 规则：
     *
     *     1. 浮空窗确认后统一走 update_node operation。
     *     2. 校验通过后关闭浮空窗。
     */
    function confirmExistingNodeEdit(node: NodeData): void {
        if (!graphStore.currentGraph) {
            return
        }

        const result = graphStore.applyOperation({
            type: 'update_node',
            node,
        })

        uiStore.lastOperationValidation = result

        if (result.valid) {
            uiStore.closeFloatingWindow()
        }
    }

    /**
     * 功能：
     *
     *     确认已有边编辑，转换为 update_edge Operation。
     *
     * 规则：
     *
     *     1. 浮空窗确认后统一走 update_edge operation。
     *     2. 校验通过后关闭浮空窗。
     */
    function confirmExistingEdgeEdit(edge: EdgeData): void {
        if (!graphStore.currentGraph) {
            return
        }

        const result = graphStore.applyOperation({
            type: 'update_edge',
            edge,
        })

        uiStore.lastOperationValidation = result

        if (result.valid) {
            uiStore.closeFloatingWindow()
        }
    }

    /**
     * 功能：
     *
     *     关闭浮空窗并清理校验结果。
     *
     * 规则：
     *
     *     1. 不影响 GraphData。
     *     2. 不取消 DraftNode。
     */
    function closeFloatingWindow(): void {
        uiStore.closeFloatingWindow()
    }

    // ── 删除操作 ──

    /**
     * 功能：
     *
     *     确认执行待定删除操作。
     *
     * 规则：
     *
     *     1. 必须在存在待定删除目标时调用。
     *     2. 执行后自动清除待定状态。
     */
    function confirmDelete(): void {
        if (uiStore.pendingDeleteNodeId) {
            executeDeleteNode(uiStore.pendingDeleteNodeId)
            uiStore.clearPendingDelete()
        } else if (uiStore.pendingDeleteEdgeId) {
            executeDeleteEdge(uiStore.pendingDeleteEdgeId)
            uiStore.clearPendingDelete()
        }
    }

    /**
     * 功能：
     *
     *     取消待定删除操作。
     */
    function cancelDelete(): void {
        uiStore.clearPendingDelete()
    }

    /**
     * 功能：
     *
     *     处理 Delete 模式下的节点点击——两步确认。
     *
     * 规则：
     *
     *     1. 首次点击：标记为待定删除目标。
     *     2. 再次点击同一节点：确认删除。
     *     3. 点击不同节点：切换待定目标到新节点。
     */
    function targetNodeForDelete(nodeId: NodeId): void {
        const currentNodeId = uiStore.pendingDeleteNodeId

        if (currentNodeId === nodeId) {
            executeDeleteNode(nodeId)
            uiStore.clearPendingDelete()
            return
        }

        uiStore.setPendingDeleteNode(nodeId)
    }

    /**
     * 功能：
     *
     *     处理 Delete 模式下的边点击——两步确认。
     *
     * 规则：
     *
     *     1. 首次点击：标记为待定删除目标。
     *     2. 再次点击同一条边：确认删除。
     *     3. 点击不同边：切换待定目标到新边。
     */
    function targetEdgeForDelete(edgeId: EdgeId): void {
        const currentEdgeId = uiStore.pendingDeleteEdgeId

        if (currentEdgeId === edgeId) {
            executeDeleteEdge(edgeId)
            uiStore.clearPendingDelete()
            return
        }

        uiStore.setPendingDeleteEdge(edgeId)
    }

    /**
     * 功能：
     *
     *     执行节点删除。
     *
     * 规则：
     *
     *     1. 执行前关闭可能正在编辑该节点的浮空窗。
     *     2. 不调用 confirm()——调用方已在确认流程中。
     */
    function executeDeleteNode(nodeId: NodeId): void {
        const floatingData = uiStore.floatingWindowData
        if (floatingData && 'id' in floatingData && floatingData.id === nodeId) {
            uiStore.closeFloatingWindow()
        }

        const result = graphStore.applyOperation({
            type: 'delete_node',
            nodeId,
        })

        uiStore.lastOperationValidation = result
    }

    /**
     * 功能：
     *
     *     执行边删除。
     *
     * 规则：
     *
     *     1. 执行前关闭可能正在编辑该边的浮空窗。
     *     2. 不调用 confirm()——调用方已在确认流程中。
     */
    function executeDeleteEdge(edgeId: EdgeId): void {
        const floatingData = uiStore.floatingWindowData
        if (floatingData && 'id' in floatingData && floatingData.id === edgeId) {
            uiStore.closeFloatingWindow()
        }

        const result = graphStore.applyOperation({
            type: 'delete_edge',
            edgeId,
        })

        uiStore.lastOperationValidation = result
    }

    // ── 添加边操作 ──

    /**
     * 功能：
     *
     *     处理 Add Edge 流程中的节点点击。
     *
     * 规则：
     *
     *     1. 只在 pendingAddTarget === 'edge' 且 kind/direction 已选定时生效。
     *     2. 第一次点击记录 sourceNodeId。
     *     3. 第二次点击构造 EdgeData 并提 add_edge Operation。
     */
    function targetNodeForEdge(nodeId: NodeId): void {
        if (uiStore.pendingAddTarget !== 'edge') {
            return
        }

        const edgeKind = uiStore.pendingAddEdge.kind
        const edgeDirection = uiStore.pendingAddEdge.direction

        if (!edgeKind || !edgeDirection) {
            return
        }

        if (!uiStore.pendingAddEdge.sourceNodeId) {
            uiStore.pendingAddEdge.sourceNodeId = nodeId
            return
        }

        if (!graphStore.currentGraph) {
            return
        }

        const edge: EdgeData = {
            id: generateEdgeId(),
            graphId: graphStore.currentGraph.id,
            source: uiStore.pendingAddEdge.sourceNodeId,
            target: nodeId,
            kind: edgeKind,
            direction: edgeDirection,
            label: '',
        }

        const result = graphStore.applyOperation({
            type: 'add_edge',
            edge,
        })

        uiStore.lastOperationValidation = result

        if (result.valid) {
            uiStore.resetPendingEdge()
        }
    }

    // ── 折叠操作 ──

    /**
     * 功能：
     *
     *     处理 Fold/Expand toggle。
     *
     * 规则：
     *
     *     1. 检查目标节点是否已被折叠。
     *     2. 已折叠 → expand_dependency。
     *     3. 未折叠 → collapse_dependency。
     */
    function toggleFold(nodeId: NodeId): void {
        const foldedDeps = graphStore.currentGraph?.cognitiveState?.foldedDependencies ?? []
        const isFolded = foldedDeps.some(f => f.targetNodeId === nodeId)

        if (isFolded) {
            graphStore.applyOperation({
                type: 'expand_dependency',
                targetNodeId: nodeId,
            })
        } else {
            graphStore.applyOperation({
                type: 'collapse_dependency',

                targetNodeId: nodeId,
            })
        }
    }

    // ── 公开 API ──

    return {
        // cognitive
        explore,
        unearth,
        deconstruct,
        induce,
        internalize,
        diverge,
        // arrangement
        moveNode,
        // draft
        updateDraftNode,
        cancelDraftNode,
        confirmDraftNode,
        // editing
        confirmExistingNodeEdit,
        confirmExistingEdgeEdit,
        closeFloatingWindow,
        // delete
        confirmDelete,
        cancelDelete,
        targetNodeForDelete,
        targetEdgeForDelete,
        executeDeleteNode,
        executeDeleteEdge,
        // add edge
        targetNodeForEdge,
        // fold
        toggleFold,
    }
}
