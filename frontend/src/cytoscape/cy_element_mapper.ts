/**
 * 功能：
 *     将 GraphData 转换为 Cytoscape 渲染元素。纯编排：
 *     1. 折叠过滤——隐藏被折叠的节点和边
 *     2. 调用 visual_mapper 计算节点直径、字号、边宽
 *     3. 调用 class_mapper 派生 CSS class
 *
 * 外部如何使用：
 *     renderer 的 syncFromGraphData() 调用 mapGraphDataToCyElements(graph)。
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
 *     将 GraphData 映射为 Cytoscape elements。
 *
 * 规则：
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
        position: node.position,
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
