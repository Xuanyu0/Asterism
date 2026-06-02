/**
 * 功能：
 *     将 Cytoscape 原始事件翻译为项目语义事件。
 *
 * 总体结构：
 *     1. GraphCanvasPosition
 *     2. GraphInteractionHandlers
 *     3. useGraphInteraction()
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 在 renderer mount 后传入 cy 实例与语义事件回调。
 */

import type { Core, EventObject } from 'cytoscape'
import type { NodeId, EdgeId, NodePosition } from '@/definitions/types/graph_types'

/**
 * 功能：
 *     图画布点击位置。
 *
 * 规则：
 *     1. 坐标来自 Cytoscape renderedPosition。
 *     2. 后续是否写入 GraphData 由 operation_controller 决定。
 */
export interface GraphCanvasPosition extends NodePosition {

}

/**
 * 功能：
 *     Cytoscape 交互语义事件回调。
 *
 * 规则：
 *     1. 本接口只表达用户行为。
 *     2. 不表达业务操作结果。
 */
export interface GraphInteractionHandlers {
    onCanvasClicked?: (position: GraphCanvasPosition) => void
    onNodeClicked?: (nodeId: NodeId) => void
    onEdgeClicked?: (edgeId: EdgeId) => void
    onNodeDragEnded?: (nodeId: NodeId, position: NodePosition) => void
}

/**
 * 功能：
 *     绑定 Cytoscape 交互事件。
 *
 * 规则：
 *     1. 只读取 Cytoscape 事件。
 *     2. 只输出项目语义事件。
 *     3. 禁止读取 ui_store / draft_store / graph_store。
 *     4. 禁止创建 GraphOperation。
 *
 * 使用：
 *     useGraphInteraction(cy, handlers)
 */
export function useGraphInteraction(
    cy: Core,
    handlers: GraphInteractionHandlers,
): void {
    cy.on('tap', (event: EventObject) => {
        if (event.target === cy) {
            handlers.onCanvasClicked?.({
                x: event.position.x,
                y: event.position.y,
            })

            return
        }

        if (event.target.isNode()) {
            handlers.onNodeClicked?.(
                event.target.id() as NodeId,
            )

            return
        }

        if (event.target.isEdge()) {
            handlers.onEdgeClicked?.(
                event.target.id() as EdgeId,
            )
        }
    })

    cy.on('dragfree', 'node', (event: EventObject) => {
        const node = event.target
        const position = node.position()

        handlers.onNodeDragEnded?.(
            node.id() as NodeId,
            {
                x: position.x,
                y: position.y,
            },
        )
    })
}
