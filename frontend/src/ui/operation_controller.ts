/**
 * operation_controller.ts
 *
 * 功能：
 *
 *     纯 UI 适配层。负责事件路由回退和认知/布局操作编排。
 *     工具栏工具事件已由 tools/tool_mediator 接管。
 *     模式管理已由 tools/tool_mediator 统一接管（3.0-1）。
 *
 * 总体结构：
 *
 *     1. 语义事件 Payload 定义
 *     2. useOperationController()：
 *        - 认知操作  — induce / internalize / diverge / explore / unearth
 *        - 布局操作  — moveNode
 *        - 事件分派  — handleNodeClicked / handleEdgeClicked（无工具时打开浮空窗）
 *        - 画布定位请求  — requestCanvasFocus / clearCanvasFocus
 *
 * 规则：
 *
 *     1. 可以读取 ui_store。
 *     2. 禁止直接修改 GraphData。
 *     3. 禁止操作 Cytoscape 实例。
 *     4. 所有图操作通过引擎 compose → graphStore.applyBatch 链路执行。
 *
 * 外部如何使用：
 *
 *     Graph.vue、GraphNodeWindow.vue、GraphModeSelector.vue、
 *     GraphNavigationCard.vue 调用本文件。
 */

import type {
    NodeId,
    EdgeId,
    GraphPosition,
    GraphData,
    NodeRadiusMap,
} from '@my-project/graph-engine'
import type { GraphRegistry } from '@/graph/graph_registry'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'

import { mapComposeIssues, hasErrors } from '@/graph/issue_mapper'

import { DEFAULT_LAYOUT_RULES } from '@my-project/graph-engine'

// compose — arrangement
import { moveNode as composeMoveNode } from '@my-project/graph-engine'
// compose — cognitive
import { induce as composeInduce } from '@my-project/graph-engine'
import { internalize as composeInternalize } from '@my-project/graph-engine'
import { diverge as composeDiverge } from '@my-project/graph-engine'


// ── 语义事件 Payload ──

/**
 * 功能：
 *
 *     画布点击语义事件。
 *
 * 规则：
 *
 *     1. 坐标来自 Cytoscape 交互适配层。
 */
export type CanvasClickedPayload = GraphPosition

/**
 * 功能：
 *
 *     节点点击语义事件。
 *
 * 规则：
 *
 *     1. 只表达用户点击了哪个节点。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface NodeClickedPayload {
    nodeId: NodeId
}

/**
 * 功能：
 *
 *     边点击语义事件。
 *
 * 规则：
 *
 *     1. 只表达用户点击了哪条边。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface EdgeClickedPayload {
    edgeId: EdgeId
}


// ── 模块级私有辅助函数 ──

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

/**
 * 功能：
 *
 *     在 Registry 中查找常识层图。
 */
function findCommonLayer(graphRegistry: GraphRegistry): GraphData | undefined {
    for (const [, graph] of graphRegistry) {
        if (graph.kind === 'commonLayer') {
            return graph
        }
    }

    return undefined
}

// ── useOperationController ──

/**
 * 功能：
 *
 *     提供 UI 操作控制器——认知/布局操作编排和事件路由回退。
 *     工具栏工具事件已由 tools/tool_mediator 接管。
 *     模式管理已由 tools/tool_mediator 统一接管（3.0-1）。
 *
 * 规则：
 *
 *     1. 可以读取 ui_store。
 *     2. 禁止直接修改 GraphData。
 *     3. 禁止操作 Cytoscape 实例。
 *     4. 所有图操作通过引擎 compose → graphStore.applyBatch 链路执行。
 *
 * 使用：
 *
 *     const controller = useOperationController()
 *     controller.handleNodeClicked({ nodeId: '...' })
 */
export function useOperationController() {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
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
     *     归纳——多个节点聚合为抽象节点 + 子图 + 沟通节点。
     *
     * 规则：
     *
     *     1. 委托引擎 composeInduce 产出跨图 operations。
     *     2. applyBatchToGraphs 批量提交父图和子图。
     *     3. 任一图失败则整批丢弃。
     */
    function induce(nodeIds: NodeId[]): void {
        if (!graphStore.graphView || nodeIds.length < 2) {
            return
        }

        const result = composeInduce({
            nodeIds,
            parentGraph: graphStore.graphView,
            lookupGraph: graphStore.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(graphStore.graphView),
            allEdges: graphStore.graphView.edges,
        })

        if (hasErrors(result.issues)) {
            graphStore.lastValidationResult = {
                valid: false,
                issues: mapComposeIssues(result.issues, 'graph'),
            }

            return
        }

        const targets = []

        if (result.operations.parent.length > 0) {
            targets.push({
                graph: graphStore.graphView,
                operations: result.operations.parent,
            })
        }

        if (result.operations.child.length > 0) {
            targets.push({
                graph: result.childGraphData,
                operations: result.operations.child,
            })
        }

        const batchResult = graphStore.applyBatchToGraphs(targets)

        graphStore.lastValidationResult = batchResult.validation
    }

    /**
     * 功能：
     *
     *     内化——将知识节点从工作区转移至常识层。
     *
     * 规则：
     *
     *     1. 委托引擎 composeInternalize 产出跨图 operations。
     *     2. applyBatchToGraphs 批量提交父图和常识层。
     *     3. 当前 registry 中未找到常识层图时拒绝执行。
     *
     * 注意：
     *
     *     composeInternalize 返回的 operations.child 是按子图分组的删除操作，
     *     但当前返回结构未携带子图 ID 映射。Phase 2b 后续需补齐子图操作的多图分发。
     *     本函数当前仅提交 parent 与 commonLayer，与 Phase 2a 行为保持一致。
     */
    function internalize(nodeIds: NodeId[]): void {
        if (!graphStore.graphView || nodeIds.length === 0) {
            return
        }

        const commonLayer = findCommonLayer(graphStore.graphRegistry)

        if (!commonLayer) {
            graphStore.lastValidationResult = {
                valid: false,
                issues: [{
                    severity: 'error',
                    code: 'COMMON_LAYER_NOT_FOUND',
                    message: '未找到常识层图谱，无法执行内化操作。',
                    targetType: 'graph',
                }],
            }

            return
        }

        const result = composeInternalize({
            nodeIds,
            parentGraph: graphStore.graphView,
            commonLayer,
            lookupGraph: graphStore.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(graphStore.graphView),
        })

        if (hasErrors(result.issues)) {
            graphStore.lastValidationResult = {
                valid: false,
                issues: mapComposeIssues(result.issues, 'graph'),
            }

            return
        }

        const targets = []

        if (result.operations.parent.length > 0) {
            targets.push({
                graph: graphStore.graphView,
                operations: result.operations.parent,
            })
        }

        if (result.operations.commonLayer.length > 0) {
            targets.push({
                graph: commonLayer,
                operations: result.operations.commonLayer,
            })
        }

        const batchResult = graphStore.applyBatchToGraphs(targets)

        graphStore.lastValidationResult = batchResult.validation
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
     *     3. applyBatchToGraphs 批量提交 current 与 peer。
     */
    function diverge(sourceNodeId: NodeId, targetNodeId: NodeId, heuristicPosition: { x: number; y: number } | null): void {
        if (!graphStore.graphView) {
            return
        }

        const result = composeDiverge({
            sourceNodeId,
            targetNodeId,
            currentGraph: graphStore.graphView,
            heuristicPosition,
            lookupGraph: graphStore.makeLookup(),
            graphIds: Array.from(graphStore.graphRegistry.keys()),
        })

        if (hasErrors(result.issues)) {
            graphStore.lastValidationResult = {
                valid: false,
                issues: mapComposeIssues(result.issues, 'graph'),
            }

            return
        }

        const targets = []

        if (result.operations.current.length > 0) {
            targets.push({
                graph: graphStore.graphView,
                operations: result.operations.current,
            })
        }

        if (result.operations.peer.length > 0) {
            // 对端图：通过 registry 查找 peer 操作目标图
            for (const draft of result.drafts) {
                if ('graphId' in draft && draft.graphId !== graphStore.graphView?.id) {
                    const peerGraph = graphStore.getGraphById(draft.graphId)

                    if (peerGraph) {
                        targets.push({
                            graph: peerGraph,
                            operations: result.operations.peer,
                        })
                    }

                    break
                }
            }
        }

        const batchResult = graphStore.applyBatchToGraphs(targets)

        graphStore.lastValidationResult = batchResult.validation
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
        if (!graphStore.graphView) {
            return
        }

        const result = composeMoveNode({
            nodeId,
            desiredPosition: position,
            allNodes: graphStore.graphView.nodes,
            nodeRadiusOverrides: computeNodeRadiusOverrides(graphStore.graphView),
        })

        if (hasErrors(result.issues)) {
            graphStore.lastValidationResult = {
                valid: false,
                issues: mapComposeIssues(result.issues, 'node', nodeId),
            }

            return
        }

        const batchResult = graphStore.applyBatchToGraph(
            graphStore.graphView,
            result.operations,
        )

        graphStore.lastValidationResult = batchResult.validation
    }

    // ── 浮空窗关闭 ──

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

    // ── 事件分派 ──

    /**
     * 功能：
     *
     *     处理节点点击——打开浮空窗。
     *     工具栏工具和认知/布局工具事件由 mediator 转发。
     *
     * 规则：
     *
     *     1. 本函数仅为画布上无工具激活时的默认回退行为。
     *     2. 有工具激活时事件由 mediator 转发至 activeHandler。
     */
    function handleNodeClicked(
        payload: NodeClickedPayload,
    ): void {
        // 默认行为：打开节点编辑浮空窗
        const node = graphStore.graphView?.nodes.find(node => node.id === payload.nodeId)
        if (node) {
            uiStore.openFloatingWindow(node)
        }
    }

    /**
     * 功能：
     *
     *     处理边点击——打开浮空窗。工具栏工具事件由 router 转发。
     */
    function handleEdgeClicked(
        payload: EdgeClickedPayload,
    ): void {
        const edge = graphStore.graphView?.edges.find(potentialEdge => potentialEdge.id === payload.edgeId)
        if (edge) {
            uiStore.openFloatingWindow(edge)
        }
    }

    // ── 画布定位请求 ──

    /**
     * 功能：
     *
     *     请求画布视口定位到指定元素（节点/边）。
     *     意图写入 ui_store，由 Graph.vue 消费并交给 renderer 执行。
     *
     * 参数：
     *
     *     targetId — 目标节点/边的 ID，与渲染元素的 id 一致。
     */
    function requestCanvasFocus(targetId: string): void {
        uiStore.requestCanvasFocus(targetId)
    }

    /**
     * 功能：
     *
     *     清除画布定位请求。由消费方（Graph.vue）在执行后调用。
     */
    function clearCanvasFocus(): void {
        uiStore.clearCanvasFocus()
    }

    // ── 公开 API ──

    return {
        // 认知操作（3.0-1 待迁移至 ToolHandler：induce / internalize / diverge）
        explore,
        unearth,
        induce,
        internalize,
        diverge,
        // 布局操作
        moveNode,
        // 交互事件
        handleNodeClicked,
        handleEdgeClicked,
        // 画布定位请求
        requestCanvasFocus,
        clearCanvasFocus,
        // 浮空窗关闭
        closeFloatingWindow,

        /**
         * 只读 UI 状态通道。包含 uiStore 的全部可读字段。
         *
         * 规则：
         *
         *     1. 组件读取 UI 状态必须通过 `controller.ui.state.xxx`。
         *     2. 禁止通过本通道执行 uiStore 的写操作。
         *     3. 所有 UI 状态写入必须调用 controller 的公开方法。
         *
         * 注意：
         *
         *     本约束是架构规约而非编译器保护——
         *     组件层仍可直接 import { useUIStore } 绕过。
         *     ui.state 是在代码中做视觉提醒，不是安全屏障。
         */
        ui: {
            state: uiStore,
        },
    }
}
