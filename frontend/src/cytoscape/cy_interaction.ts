/**
 * 功能：
 *
 *     将 Cytoscape 原始事件翻译为项目语义事件。
 *
 * 总体结构：
 *
 *     1. CyCanvasPosition
 *     2. CyInteractionHandlers（tap / cxttap / dblclick / mouseover / mouseout）
 *     3. bindCyEvents()
 */

import type { Core, EventObject } from 'cytoscape'
import type { NodeId, EdgeId } from '@my-project/graph-engine'

/**
 * 功能：
 *
 *     图画布点击位置。
 *
 * 规则：
 *
 *     1. 坐标来自 Cytoscape renderedPosition。
 *     2. 后续是否写入 GraphData 由 operation_controller 决定。
 */
export interface CyCanvasPosition {
    x: number
    y: number
}

/**
 * 功能：
 *
 *     Cytoscape 交互语义事件回调。
 *
 * 规则：
 *
 *     1. 本接口只表达用户行为。
 *     2. 不表达业务操作结果。
 */
export interface CyInteractionHandlers {
    onCanvasClicked?: (position: CyCanvasPosition) => void
    onNodeClicked?: (nodeId: NodeId) => void
    onEdgeClicked?: (edgeId: EdgeId) => void
    onRightClick?: () => void
    onNodeDoubleClicked?: (nodeId: NodeId) => void
    onNodeHovered?: (nodeId: NodeId) => void
    onNodeHoverOut?: (nodeId: NodeId) => void
}

/**
 * 功能：
 *
 *     绑定 Cytoscape 交互事件。
 *
 * 规则：
 *
 *     1. 只读取 Cytoscape 事件。
 *     2. 只输出项目语义事件。
 *     3. 禁止读取 graph_store。
 *     4. 禁止创建 GraphOperation。
 *     5. 借用 vue 组合式函数的功能，但非真正的组合式函数
 */
export function bindCyEvents(
    cy: Core,
    handlers: CyInteractionHandlers,
): { destroy(): void } {
    cy.on('tap', (event: EventObject) => {
        if (event.target === cy) {
            handlers.onCanvasClicked?.({
                x: event.position.x,
                y: event.position.y,
            })
        }
        else if (event.target.isNode()) {
            handlers.onNodeClicked?.(
                event.target.id() as NodeId,
            )
        }
        else if (event.target.isEdge()) {
            handlers.onEdgeClicked?.(
                event.target.id() as EdgeId,
            )
        }
    })

    cy.on('cxttap', () => {
        handlers.onRightClick?.()
    })

    cy.on('dblclick', (event: EventObject) => {
        if (event.target.isNode()) {
            handlers.onNodeDoubleClicked?.(
                event.target.id() as NodeId,
            )
        }

        // 画布双击和边双击：不处理（不调用任何 handler）
    })

    // hover 事件目标可能是画布/边/节点，只对节点产生语义事件
    cy.on('mouseover', 'node', (event: EventObject) => {
        handlers.onNodeHovered?.(
            event.target.id() as NodeId,
        )
    })

    cy.on('mouseout', 'node', (event: EventObject) => {
        handlers.onNodeHoverOut?.(
            event.target.id() as NodeId,
        )
    })

    return {
        destroy(): void {
            cy.off('tap')
            cy.off('cxttap')
            cy.off('dblclick')
            cy.off('mouseover', 'node')
            cy.off('mouseout', 'node')
        },
    }
}
