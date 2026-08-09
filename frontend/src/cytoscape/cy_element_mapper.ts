/**
 * 功能：
 *
 *     将 GraphData 转换为 Cytoscape 渲染元素。纯编排：
 *     1. 折叠过滤——隐藏被折叠的节点和边
 *     2. 调用 visual_mapper 计算节点直径、字号、边宽
 *     3. 调用 class_mapper 派生 CSS class
 */

import type {
    EdgeData,
    EdgeId,
    GraphData,
    NodeData,
    NodeId,
    NodePosition,
} from '@my-project/graph-engine'

import { getNodeClasses, getEdgeClasses } from './mapper-utils/class_mapper'
import { computeNodeDiameter, computeFontSize, computeEdgeWidth, buildNodeMassLookup, calcEdgeDistance } from './mapper-utils/visual_mapper'
import { extractFoldFilter } from './mapper-utils/fold_filter'

interface CyNodeElement {
    group: 'nodes'
    data: {
        id: NodeId
        label: string
        nodeDiameter: number
        fontSize: number
    }
    position?: NodePosition
    classes?: string[]
}

interface CyEdgeElement {
    group: 'edges'
    data: {
        id: EdgeId
        source: NodeId
        target: NodeId
        label?: string
        edgeWidth: number
    }
    classes?: string[]
}

/**
 * Cytoscape 渲染元素集合。
 */
export interface CyElements {
    nodes: CyNodeElement[]
    edges: CyEdgeElement[]
}

/**
 * 功能：
 *
 *     将 GraphData 映射为 Cytoscape elements。
 *
 * 规则：
 *
 *     1. GraphData 是唯一事实源。
 *     2. Cytoscape 只能接收映射数据。
 *     3. 被依赖折叠隐藏的节点和相关边不进入渲染结果。
 */
export function mapGraphDataToCyElements(graph: GraphData): CyElements {
    const { foldedNodeIds, foldedParentIds } = extractFoldFilter(graph)
    const nodeMassLookup = buildNodeMassLookup(graph.nodes)
    
    return {
        nodes: graph.nodes
            .filter((node) => !foldedNodeIds.has(node.id))
            .map((node) => mapNodeToCyElement(node, foldedParentIds)),

        edges: graph.edges
            .filter((edge) => !foldedNodeIds.has(edge.source) && !foldedNodeIds.has(edge.target))
            .map((edge) => mapEdgeToCyElement(edge, nodeMassLookup)),
    }
}

function mapNodeToCyElement(node: NodeData, foldedParentIds: Set<NodeId>): CyNodeElement {
    return {
        group: 'nodes',
        data: {
            id: node.id,
            label: node.label,
            nodeDiameter: computeNodeDiameter(node.degree),
            fontSize: computeFontSize(node.degree),
        },
        // 拷贝 position 值而非传引用：Cytoscape Element 构造时把 position 对象【按引用】
        // 存入 _private.position（element.mjs），后续 cy.json 更新会经 ele.position()
        // 原地写回该对象。若传入 GraphData 的 position（graphView 场景下是 Vue reactive
        // Proxy），预览 sync 就会把预览位置写穿回 graphStore.graphView——move 预览污染
        // 根因。渲染层必须持有自己的副本，GraphData 是唯一事实源。
        position: node.position ? { x: node.position.x, y: node.position.y } : undefined,
        classes: getNodeClasses(node, foldedParentIds),
    }
}

function mapEdgeToCyElement(
    edge: EdgeData,
    nodeLookup: Map<NodeId, { mass: number; position?: NodePosition }>,
): CyEdgeElement {
    const src = nodeLookup.get(edge.source)
    const tgt = nodeLookup.get(edge.target)
    const dist = calcEdgeDistance(src, tgt)

    return {
        group: 'edges',
        data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            edgeWidth: computeEdgeWidth(src?.mass ?? 1, tgt?.mass ?? 1, dist),
        },
        classes: getEdgeClasses(edge),
    }
}
