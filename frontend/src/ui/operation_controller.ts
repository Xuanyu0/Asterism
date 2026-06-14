/**
 * 功能：
 *     统一接收图交互语义事件，并将用户意图转换为 Draft 或 GraphOperation。
 *     三种交互模式（Cognition / Operation / Arrangement）的统一编排入口。
 *
 * 总体结构：
 *     1. 语义事件 Payload 定义
 *     2. ID 生成 helper
 *     3. useOperationController()：
 *        - Operation 模式：工具栏切换、Add/Delete/Fold 流程
 *        - Cognition 模式（占位）：explore / discover / deconstruct / induce / internalize
 *        - Arrangement 模式（占位）：move / adjust / 布局操作
 *        - 通用：交互事件处理（handleCanvasClicked / handleNodeClicked / handleEdgeClicked）
 *        - 通用：DraftNode 生命周期
 *        - 通用：浮空窗编辑已有节点/边
 *
 * GraphEngine 铺垫：
 *     本文件是 Phase 2 GraphEngine 的前端适配层雏形。
 *     当前 operation_executor / operation_validator / graph_utils 已是纯函数/静态类，
 *     不依赖 Vue/Pinia。Phase 2 只需将 graph_store + 纯函数层 + 类型抽离为独立引擎，
 *     本 controller 退化为薄适配层。
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue、NodeWindow.vue、OperationToolbar.vue 调用本文件。
 */

import type {
    EdgeData,
    NodeData,
    NodeId,
    EdgeId,
    GraphPosition
} from '@my-project/graph-engine'
import type { DraftNode } from '@/definitions/types/draft_types'
import type { OperationTool, AddTarget } from '@/definitions/types/ui_types'
import type { EdgeKind, EdgeDirection } from '@my-project/graph-engine'
import type { KnowledgeNodeKind } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'
import { useDraftStore } from '@/ui/draft_store'

// 语义事件 Payload 定义 ══════════════════════════════════════════

/**
 * 功能：
 *     画布点击语义事件。
 *
 * 规则：
 *     1. 坐标来自 Cytoscape 交互适配层。
 *     2. 是否创建 DraftNode 由当前 UI Runtime 状态决定。
 */
export interface CanvasClickedPayload extends GraphPosition {

}

/**
 * 功能：
 *     节点点击语义事件。
 *
 * 规则：
 *     1. 只表达用户点击了哪个节点。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface NodeClickedPayload {
    nodeId: NodeId
}

/**
 * 功能：
 *     边点击语义事件。
 *
 * 规则：
 *     1. 只表达用户点击了哪条边。
 *     2. 不携带 Cytoscape 原始事件。
 */
export interface EdgeClickedPayload {
    edgeId: EdgeId
}

// 语义事件 Payload 结束 ══════════════════════════════════════════

// ID 生成 helper ══════════════════════════════════════════════════

/**
 * 功能：
 *     创建节点 id。
 *
 * 规则：
 *     1. MVP 阶段使用前端临时 id。
 *     2. 后续可替换为统一 id runtime。
 */
function createNodeId(): NodeId {
    return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as NodeId
}

/**
 * 功能：
 *     创建边 id。
 *
 * 规则：
 *     1. MVP 阶段使用前端临时 id。
 *     2. 后续可替换为统一 id runtime。
 */
function createEdgeId(): EdgeId {
    return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as EdgeId
}

// ID 生成 helper 结束 ══════════════════════════════════════════════

/**
 * 功能：
 *     提供 UI 操作控制器——三种交互模式的统一编排入口。
 *
 * 规则：
 *     1. 可以读取 ui_store 与 draft_store。
 *     2. 可以调用 graph_store.applyOperation()。
 *     3. 禁止直接修改 GraphData。
 *     4. 禁止操作 Cytoscape 实例。
 *     5. 所有 GraphData 写入路径必须经过本文件的公开方法。
 *
 * 使用：
 *     const controller = useOperationController()
 *     controller.enterOperationMode()
 *     controller.handleNodeClicked({ nodeId: '...' })
 */
export function useOperationController() {
    const graphStore = useGraphStore()
    const uiStore = useUIStore()
    const draftStore = useDraftStore()

    // Operation 模式 ═══════════════════════════════════════════════
        // 模式入口 ────────────────────────────────────────────
        /**
         * 功能：
         *     切换到 Operation 交互模式。
         *
         * 规则：
         *     1. 与 Cognition 模式互斥。
         *     2. 重置 Cognition 相关状态。
         */
        function enterOperationMode(): void {
            uiStore.setInteractionMode('operation')
        }

        /**
         * 功能：
         *     切换到 Cognition 交互模式。
         *
         * 规则：
         *     1. 与 Operation 模式互斥。
         *     2. 重置 Operation 相关状态。
         */
        function enterCognitionMode(): void {
            uiStore.setInteractionMode('cognition')
        }

        /**
         * 功能：
         *     进入 Arrangement 交互模式。
         *
         * 规则：
         *     Phase 2 占位。当前模式下无激活工具。
         */
        function enterArrangementMode(): void {
            uiStore.setInteractionMode('arrangement')
        }
        // 模式入口 结束 ────────────────────────────────────────
        // 工具选择 ────────────────────────────────────────────
        /**
         * 功能：
         *     选择 Operation 模式下的工具。
         *
         * 规则：
         *     1. null 表示取消选择，回到默认相机模式。
         *     2. 切换工具时重置上一工具的待定状态。
         */
        function selectOperationTool(tool: OperationTool | null): void {
            uiStore.selectOperationTool(tool)
        }

        /**
         * 功能：
         *     设置 Add 工具下的二级目标（node / edge）。
         *
         * 规则：
         *     1. 切换目标时重置待定添加状态。
         */
        function selectAddTarget(target: AddTarget | null): void {
            uiStore.setAddTarget(target)
        }

        /**
         * 功能：
         *     选择准备添加的节点类型。
         *
         * 规则：
         *     1. 设置后用户下一次点击空白画布进入 DraftNode 流程。
         */
        function selectAddNodeKind(kind: KnowledgeNodeKind | null): void {
            uiStore.selectNodeKind(kind)
        }

        /**
         * 功能：
         *     选择准备添加的边本体类型（实边 / 虚边）。
         *
         * 规则：
         *     1. 修改边类型时重置边方向与起点。
         */
        function selectAddEdgeKind(kind: EdgeKind | null): void {
            uiStore.selectEdgeKind(kind)
        }

        /**
         * 功能：
         *     选择准备添加的边方向（有向 / 无向）。
         *
         * 规则：
         *     1. 修改方向时重置起始节点。
         */
        function selectAddEdgeDirection(direction: EdgeDirection | null): void {
            uiStore.selectEdgeDirection(direction)
        }

        /**
         * 功能：
         *     重置当前 Operation 工具状态，回到默认模式。
         */
        function resetOperationTool(): void {
            uiStore.resetOperationState()
        }

        /**
         * 功能：
         *     退出当前模式，回到无模式默认状态。
         *
         * 规则：
         *     右键两级退出的第二层——清除模式本身。
         */
        function exitMode(): void {
            uiStore.exitMode()
        }
        // 工具选择 结束 ────────────────────────────────────────
        // 右键退出（两级） ────────────────────────────────────
        /**
         * 功能：
         *     处理画布区域右键点击。
         *
         * 规则：
         *     两级退出：
         *     1. 有激活工具 → 清工具，保留模式（第一层）。
         *     2. 无激活工具 → 退出模式（第二层）。
         */
        function handleRightClick(): void {
            const mode = uiStore.interactionMode

            if (mode === null) {
                return
            }

            if (mode === 'operation') {
                if (uiStore.selectedOperationTool !== null) {
                    uiStore.resetOperationState()
                    return
                }
                uiStore.exitMode()
                return
            }

            if (mode === 'cognition') {
                if (uiStore.selectedCognitionAction !== null) {
                    uiStore.selectCognitionAction(null)
                    return
                }
                uiStore.exitMode()
                return
            }

            if (mode === 'arrangement') {
                uiStore.exitMode()
            }
        }
        // 右键退出 结束 ────────────────────────────────────────
    // Operation 结束 ═══════════════════════════════════════════════

    // Cognition 模式（Phase 2 占位） ═══════════════════════════════
        /**
         * 功能：
         *     探索——开始新一轮学习。
         *
         * 规则：
         *     1. Phase 2 GraphEngine + AI Runtime 实现。
         */
        function explore(): void {
            // TODO: Phase 2 — AI Runtime 单轮学习入口
        }

        /**
         * 功能：
         *     发掘——对虚节点或无向虚边开启学习。
         *
         * 规则：
         *     1. Phase 2 GraphEngine + AI Runtime 实现。
         */
        function discover(_targetNodeId?: NodeId, _targetEdgeId?: EdgeId): void {
            // TODO: Phase 2 — AI Runtime 发掘入口
        }

        /**
         * 功能：
         *     解构——单个实节点抽象并建立子图。
         *
         * 规则：
         *     1. Phase 2 GraphEngine 实现。
         */
        function deconstruct(_nodeId: NodeId): void {
            // TODO: Phase 2 — GraphEngine 子图创建
        }

        /**
         * 功能：
         *     归纳——多个节点聚合为抽象节点。
         *
         * 规则：
         *     1. Phase 2 GraphEngine 实现。
         */
        function induce(_nodeIds: NodeId[]): void {
            // TODO: Phase 2 — GraphEngine 归纳操作
        }

        /**
         * 功能：
         *     内化/常识化——转移节点至常识层。
         *
         * 规则：
         *     1. Phase 2 GraphEngine 实现。
         */
        function internalize(_nodeIds: NodeId[]): void {
            // TODO: Phase 2 — GraphEngine 常识层转移
        }
    // Cognition 结束 ═══════════════════════════════════════════════

    // Arrangement 模式（Phase 2 占位） ═════════════════════════════
        /**
         * 功能：
         *     单节点移动。
         *
         * 规则：
         *     1. Phase 2 Arrangement 模式实现。
         *     2. 当前 Operation 模式不提供单节点 Move（已迁移至 Arrangement）。
         */
        function moveNode(_nodeId: NodeId, _position: { x: number; y: number }): void {
            // TODO: Phase 2 — Arrangement 模式单点移动
        }
    // Arrangement 结束 ═════════════════════════════════════════════

    // 通用功能 ═════════════════════════════════════════════════════
        // 交互事件处理 ────────────────────────────────────────
        /**
         * 功能：
         *     处理画布点击。
         *
         * 规则：
         *     1. 仅在 Operation / Add / Node / kind 已确定时创建 DraftNode。
         *     2. 不直接创建正式 NodeData。
         *     3. 在 Delete 模式下，点击空白画布清除待定删除目标。
         */
        function handleCanvasClicked(
            payload: CanvasClickedPayload,
        ): void {
            if (uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'delete') {
                uiStore.clearPendingDelete()
                return
            }

            if (uiStore.interactionMode !== 'operation') {
                return
            }

            if (uiStore.selectedOperationTool !== 'add') {
                return
            }

            if (uiStore.pendingAddTarget !== 'node') {
                return
            }

            if (!uiStore.pendingAddNode.kind) {
                return
            }

            draftStore.createDraftNode(
                uiStore.pendingAddNode.kind,
                payload.x,
                payload.y,
            )
        }

        /**
         * 功能：
         *     处理节点点击——根据当前 UI 状态上下文感知分派。
         *
         * 规则：
         *     1. 默认模式（无激活工具）→ 打开节点编辑浮空窗。
         *     2. Add + Edge 模式 → Add Edge 流程（第一次点击选 source，第二次点击创建边）。
         *     3. Delete 模式 → 删除节点。
         *     4. Fold 模式 → toggle 依赖折叠/展开。
         */
        function handleNodeClicked(
            payload: NodeClickedPayload,
        ): void {
            const mode = uiStore.interactionMode
            const tool = uiStore.selectedOperationTool

            if (mode !== 'operation' || !tool) {
                const node = graphStore.currentGraph?.nodes.find(node => n.id === payload.nodeId)
                if (node) {
                    uiStore.openFloatingWindow(node)
                }
                return
            }

            switch (tool) {
                case 'add': {
                    handleAddEdgeNodeClick(payload.nodeId)
                    break
                }

                case 'delete': {
                    handleDeleteNodeClick(payload.nodeId)
                    break
                }

                case 'fold': {
                    handleFoldToggle(payload.nodeId)
                    break
                }
            }
        }

        /**
         * 功能：
         *     处理边点击——根据当前 UI 状态上下文感知分派。
         *
         * 规则：
         *     1. Delete 模式 → 删除边。
         *     2. 默认模式 → 打开边编辑浮空窗。
         */
        function handleEdgeClicked(
            payload: EdgeClickedPayload,
        ): void {
            if (uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'delete') {
                handleDeleteEdgeClick(payload.edgeId)
                return
            }

            const edge = graphStore.currentGraph?.edges.find(e => e.id === payload.edgeId)
            if (edge) {
                uiStore.openFloatingWindow(edge)
            }
        }
        // 交互事件处理 结束 ────────────────────────────────────
        // DraftNode 生命周期 ──────────────────────────────────
        /**
         * 功能：
         *     更新当前 DraftNode。
         *
         * 规则：
         *     1. 只修改 Draft Runtime。
         *     2. 不进入 GraphData。
         */
        function updateDraftNode(
            patch: Partial<DraftNode>,
        ): void {
            draftStore.updateDraftNode(patch)
        }

        /**
         * 功能：
         *     取消当前 DraftNode。
         *
         * 规则：
         *     1. 只清理 Draft Runtime。
         *     2. 不影响 GraphData。
         */
        function cancelDraftNode(): void {
            draftStore.clearDraftNode()
        }

        /**
         * 功能：
         *     确认当前 DraftNode，并转换为 add_node Operation。
         *
         * 规则：
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
                id: createNodeId(),
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
        // DraftNode 结束 ──────────────────────────────────────
        // 浮空窗编辑已有节点/边 ──────────────────────────────
        /**
         * 功能：
         *     确认已有节点编辑，转换为 update_node Operation。
         *
         * 规则：
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
         *     确认已有边编辑，转换为 update_edge Operation。
         *
         * 规则：
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
         *     关闭浮空窗并清理校验结果。
         *
         * 规则：
         *     1. 不影响 GraphData。
         *     2. 不取消 DraftNode。
         */
        function closeFloatingWindow(): void {
            uiStore.closeFloatingWindow()
        }
        // 浮空窗编辑 结束 ──────────────────────────────────────
        // Delete 两步确认 ────────────────────────────────────
        /**
         * 功能：
         *     确认执行待定删除操作。
         *
         * 规则：
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
         *     取消待定删除操作。
         */
        function cancelDelete(): void {
            uiStore.clearPendingDelete()
        }
        // Delete 两步确认 结束 ────────────────────────────────
        // 内部 helper ────────────────────────────────────────
            // del ·-·-·-·-·-
            /**
             * 功能：
             *     处理 Delete 模式下的节点点击——两步确认。
             *
             * 规则：
             *     1. 首次点击：标记为待定删除目标。
             *     2. 再次点击同一节点：确认删除。
             *     3. 点击不同节点：切换待定目标到新节点。
             */
            function handleDeleteNodeClick(nodeId: NodeId): void {
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
             *     处理 Delete 模式下的边点击——两步确认。
             *
             * 规则：
             *     1. 首次点击：标记为待定删除目标。
             *     2. 再次点击同一条边：确认删除。
             *     3. 点击不同边：切换待定目标到新边。
             */
            function handleDeleteEdgeClick(edgeId: EdgeId): void {
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
             *     执行节点删除。
             *
             * 规则：
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
             *     执行边删除。
             *
             * 规则：
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
            // del 结束 ·-·-·-

        /**
         * 功能：
         *     处理 Add Edge 流程中的节点点击。
         *
         * 规则：
         *     1. 只在 pendingAddTarget === 'edge' 且 kind/direction 已选定时生效。
         *     2. 第一次点击记录 sourceNodeId。
         *     3. 第二次点击构造 EdgeData 并提 add_edge Operation。
         */
        function handleAddEdgeNodeClick(nodeId: NodeId): void {
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
                id: createEdgeId(),
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

        /**
         * 功能：
         *     处理 Fold/Expand toggle。
         *
         * 规则：
         *     1. 检查目标节点是否已被折叠。
         *     2. 已折叠 → expand_dependency。
         *     3. 未折叠 → collapse_dependency。
         */
        function handleFoldToggle(nodeId: NodeId): void {
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
        // 内部 helper 结束 ────────────────────────────────────

        return {
            enterOperationMode,
            enterCognitionMode,
            enterArrangementMode,
            selectOperationTool,
            selectAddTarget,
            selectAddNodeKind,
            selectAddEdgeKind,
            selectAddEdgeDirection,
            resetOperationTool,
            exitMode,
            explore,
            discover,
            deconstruct,
            induce,
            internalize,
            moveNode,
            handleCanvasClicked,
            handleNodeClicked,
            handleEdgeClicked,
            handleRightClick,
            updateDraftNode,
            cancelDraftNode,
            confirmDraftNode,
            confirmDelete,
            cancelDelete,
            confirmExistingNodeEdit,
            confirmExistingEdgeEdit,
            closeFloatingWindow,

            /**
             * 只读 UI 状态通道。包含 uiStore 的全部可读字段。
             *
             * 规则：
             *     1. 组件读取 UI 状态必须通过 `controller.ui.state.xxx`。
             *     2. 禁止通过本通道执行 uiStore 的写操作（setInteractionMode 等）。
             *     3. 所有 UI 状态写入必须调用 controller 的公开方法。
             *
             * 注意：
             *     本约束是架构规约而非编译器保护——
             *     组件层仍可直接 import { useUIStore } 绕过。
             *     ui.state 是在代码中做视觉提醒，不是安全屏障。
             */
            ui: {
                state: uiStore,
            },
        }
    // 通用功能 结束 ═════════════════════════════════════════════════
}
