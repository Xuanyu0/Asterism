/**
 * 功能：
 *     将 GraphData 只读投影为 Cytoscape 可渲染的元素结构。
 *
 * 总体结构：
 *     1. CyNodeData / CyEdgeData
 *     2. CyNodeElement / CyEdgeElement / CyElements
 *     3. getNodeClasses()
 *     4. getEdgeClasses()
 *     5. getFoldedNodeIds()
 *     6. mapGraphDataToCyElements()
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 或 Cytoscape Renderer 调用 mapGraphDataToCyElements(graph)。
 */

import type {
    EdgeData,
    EdgeDirection,
    EdgeId,
    EdgeKind,
    GraphData,
    NodeData,
    NodeId,
    NodePosition,
    NodeRole,
    KnowledgeNodeKind,
    ReferenceNodeKind,
    RealNodeForm,
} from '@/definitions/types/graph_types'

/**
 * 功能：
 *     Cytoscape 节点 data 投影结构。
 *
 * 规则：
 *     1. 只包含 Cytoscape 渲染和交互识别所需字段。
 *     2. 禁止直接保存完整 NodeData 引用。
 */
export interface CyNodeData {
    id: NodeId
    label: string
    role: NodeRole // 第一层判别：知识本体 / 引用投影
    kind?: KnowledgeNodeKind // 仅知识节点
    form?: RealNodeForm // 仅知识节点
    referenceKind?: ReferenceNodeKind // 仅引用节点
    degree: number
    abstractionLevel: number
}

/**
 * 功能：
 *     Cytoscape 边 data 投影结构。
 *
 * 规则：
 *     1. source / target 是 Cytoscape 识别边连接关系的必要字段。
 *     2. 禁止直接保存完整 EdgeData 引用。
 */
export interface CyEdgeData {
    id: EdgeId
    source: NodeId
    target: NodeId
    label?: string
    kind: EdgeKind
    direction: EdgeDirection
}

/**
 * 功能：
 *     Cytoscape 节点元素。
 *
 * 规则：
 *     1. group 固定为 nodes。
 *     2. position 来自 GraphData.position。
 *     3. 没有 position 时不交给自动布局决定长期位置。
 */
export interface CyNodeElement {
    group: 'nodes'
    data: CyNodeData
    position?: NodePosition
    classes?: string[]
}

/**
 * 功能：
 *     Cytoscape 边元素。
 *
 * 规则：
 *     1. group 固定为 edges。
 *     2. data 只能使用 CyEdgeData 投影结构。
 */
export interface CyEdgeElement {
    group: 'edges'
    data: CyEdgeData
    classes?: string[]
}

/**
 * 功能：
 *     Cytoscape 渲染元素集合。
 *
 * 规则：
 *     1. nodes 和 edges 分开保存，方便后续 renderer 控制同步。
 *     2. 本结构不是 GraphData，只是渲染投影。
 */
export interface CyElements {
    nodes: CyNodeElement[]
    edges: CyEdgeElement[]
}

/**
 * 功能：
 *     根据 NodeData 生成 Cytoscape 节点 class。
 *
 * 规则：
 *     1. 只读取节点字段。
 *     2. 不修改节点数据。
 */
export function getNodeClasses(node: NodeData): string[] {
    const classes: string[] = []

    if (node.role === 'knowledge') {
        classes.push(`node-${node.kind}`)
        if (node.form) classes.push(`node-${node.form}`)
    } else {
        classes.push('node-reference')
        classes.push(`ref-${node.referenceKind}`)
    }

    return classes
}

/**
 * 功能：
 *     根据 EdgeData 生成 Cytoscape 边 class。
 *
 * 规则：
 *     1. 只读取边字段。
 *     2. 不修改边数据。
 */
export function getEdgeClasses(edge: EdgeData): string[] {
    // 沟通边的视觉样式（一端半悬空/淡化）不由 viewRole 字段驱动，
    // 而是渲染层根据端点节点类型推导：
    // 若 edge.source 或 edge.target 对应的节点为 communication 节点，
    // 渲染层为该边添加 edge-communication-{source,target} class。
    // 当前此视觉效果尚未实现，后续在渲染层独立处理。
    return [
        `edge-${edge.kind}`,
        `edge-${edge.direction}`,
    ].filter((className) => className.length > 0)
}

/**
 * 功能：
 *     读取当前图中被依赖折叠隐藏的节点 ID。
 *
 * 规则：
 *     1. 折叠状态属于 GraphData.cognitiveState。
 *     2. 本函数只读取，不修改认知状态。
 */
export function getFoldedNodeIds(graph: GraphData): Set<NodeId> {
    const foldedDependencies = graph.cognitiveState?.foldedDependencies ?? []
    const foldedNodeIds = foldedDependencies.flatMap((state) => state.foldedNodeIds)

    return new Set(foldedNodeIds)
}

/**
 * 功能：
 *     将 NodeData 投影为 CyNodeElement。
 *
 * 规则：
 *     1. 禁止把完整 NodeData 作为 data 传给 Cytoscape。
 *     2. position 允许作为普通值传入，但不能由 Cytoscape 反向直接修改 GraphData。
 */
function mapNodeToCyElement(node: NodeData): CyNodeElement {
    const data: CyNodeData = {
        id: node.id,
        label: node.label,
        role: node.role,
        degree: node.degree,
        abstractionLevel: node.abstractionLevel,
    }

    if (node.role === 'knowledge') {
        data.kind = node.kind
        data.form = node.form
    } else {
        data.referenceKind = node.referenceKind
    }

    return {
        group: 'nodes',
        data,
        position: node.position,
        classes: getNodeClasses(node),
    }
}

/**
 * 功能：
 *     将 EdgeData 投影为 CyEdgeElement。
 *
 * 规则：
 *     1. 禁止把完整 EdgeData 作为 data 传给 Cytoscape。
 *     2. 只传递 Cytoscape 渲染边所需的连接关系和显示字段。
 */
function mapEdgeToCyElement(edge: EdgeData): CyEdgeElement {
    return {
        group: 'edges',
        data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            kind: edge.kind,
            direction: edge.direction,
        },
        classes: getEdgeClasses(edge),
    }
}

/**
 * 功能：
 *     将 GraphData 投影为 Cytoscape elements。
 *
 * 规则：
 *     1. GraphData 是唯一事实源。
 *     2. Cytoscape 只能接收投影数据。
 *     3. 被依赖折叠隐藏的节点和相关边不进入渲染结果。
 */
export function mapGraphDataToCyElements(graph: GraphData): CyElements {
    const foldedNodeIds = getFoldedNodeIds(graph)

    return {
        nodes: graph.nodes
            .filter((node) => !foldedNodeIds.has(node.id))
            .map((node) => mapNodeToCyElement(node)),

        edges: graph.edges
            .filter((edge) => !foldedNodeIds.has(edge.source) && !foldedNodeIds.has(edge.target))
            .map((edge) => mapEdgeToCyElement(edge)),
    }
}
