/**
 * 功能：
 *     将 GraphData 转换为 Cytoscape 渲染元素。负责两类工作：
 *     1. 语义映射：GraphData 字段 → CSS class（role、kind、form → node-real/node-virtual/…）
 *     2. 视觉属性计算：根据设计文档公式，从 degree/distance 派生节点直径、字号、边粗细
 *
 * 总体结构：
 *     1. CyNodeData / CyEdgeData     — 渲染层最小数据契约
 *     2. CyNodeElement / CyEdgeElement / CyElements
 *     3. getNodeClasses() / getEdgeClasses() — 样式类语义映射
 *     4. mapGraphDataToCyElements() — 入口：计算全部视觉属性后产出 CyElements
 *
 * 设计公式：
 *     节点直径     = 2·r₀·√(1+degree)
 *     字号         = r₀/4·√(1+degree)
 *     边粗细       = 4·r₀·(1+d₁)(1+d₂) / dist，区间为 [1, 8] px
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
import { DEFAULT_LAYOUT_RULES } from '@my-project/graph-engine'

/**
 * 功能：
 *     Cytoscape 节点 data 结构。
 *
 * 规则：
 *     1. 仅包含 Cy 渲染所需的最小字段。
 *     2. 禁止直接保存完整 NodeData 引用。
 */
export interface CyNodeData {
    id: NodeId
    label: string
    /** 节点渲染直径 = 2·r₀·√(1 + degree)。r₀ = DEFAULT_LAYOUT_RULES.r0。 */
    nodeDiameter: number
    /** 推荐字号 = r₀/4 · √(1 + degree)。与半径等比缩放，保证标签始终适应节点圆内切范围。 */
    fontSize: number
}

/**
 * 功能：
 *     Cytoscape 边 data 结构。
 *
 * 规则：
 *     1. 仅包含 Cy 渲染所需的最小字段。
 *     2. 禁止直接保存完整 EdgeData 引用。
 */
export interface CyEdgeData {
    id: EdgeId
    source: NodeId
    target: NodeId
    label?: string
    /** 边宽度 = k · (1+d₁)(1+d₂) / dist。k = 4·r₀。 */
    edgeWidth: number
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
 *     2. data 只能使用 CyEdgeData 映射结构。
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
 *     2. 本结构不是 GraphData，只是渲染映射。
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
export function getNodeClasses(node: NodeData, foldedParentIds?: Set<NodeId>): string[] {
    const classes: string[] = []

    if (node.role === 'knowledge') {
        classes.push(`node-${node.kind}`)
        if (node.form) classes.push(`node-${node.form}`)
    } else {
        classes.push('node-reference')
        classes.push(`ref-${node.referenceKind}`)
    }

    if (foldedParentIds?.has(node.id)) {
        classes.push('has-folded-deps')
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
 *     将 NodeData 映射为 CyNodeElement。
 *
 * 规则：
 *     1. 禁止把完整 NodeData 作为 data 传给 Cytoscape。
 *     2. position 允许作为普通值传入，但不能由 Cytoscape 反向直接修改 GraphData。
 */
function mapNodeToCyElement(node: NodeData, foldedParentIds: Set<NodeId>): CyNodeElement {
    const scale = Math.sqrt(1 + node.degree)

    return {
        group: 'nodes',
        data: {
            id: node.id,
            label: node.label,
            nodeDiameter: Math.round(2 * DEFAULT_LAYOUT_RULES.r0 * scale),
            fontSize: Math.round((DEFAULT_LAYOUT_RULES.r0 / 4) * scale),
        },
        position: node.position,
        classes: getNodeClasses(node, foldedParentIds),
    }
}

/**
 * 功能：
 *     将 EdgeData 映射为 CyEdgeElement。
 *
 * 规则：
 *     1. 禁止把完整 EdgeData 作为 data 传给 Cytoscape。
 *     2. 只传递 Cytoscape 渲染边所需的连接关系和显示字段。
 */
function mapEdgeToCyElement(
    edge: EdgeData,
    nodeLookup: Map<NodeId, { mass: number; position?: NodePosition }>,
): CyEdgeElement {

    // 映射边宽
    // 边宽度：w = k · (1+d₁)(1+d₂) / dist
    // k = 4·r₀：使得两个 degree=0、距离 2·r₀ 的节点间边宽为 2px
    const k = 4 * DEFAULT_LAYOUT_RULES.r0
    const src = nodeLookup.get(edge.source)
    const tgt = nodeLookup.get(edge.target)
    let edgeWidth = 2
    if (src?.position && tgt?.position) {
        const dx = tgt.position.x - src.position.x
        const dy = tgt.position.y - src.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
            edgeWidth = Math.round(k * src.mass * tgt.mass / dist)
        }
    }

    return {
        group: 'edges',
        data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            edgeWidth: Math.max(1, Math.min(8, edgeWidth)),
        },
        classes: getEdgeClasses(edge),
    }
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
    // 读取被折叠隐藏的节点 ID 和拥有折叠依赖的父节点 ID
    const foldedDeps = graph.cognitiveState?.foldedDependencies ?? []
    const foldedNodeIds = new Set(foldedDeps.flatMap((state) => state.foldedNodeIds))
    const foldedParentIds = new Set(foldedDeps.map((state) => state.targetNodeId))

    // 构建节点查找表——边宽度计算需要两端节点的大小与坐标
    const nodeLookup = new Map<NodeId, { mass: number; position?: NodePosition }>()
    for (const node of graph.nodes) {
        nodeLookup.set(node.id, {
            mass: 1 + node.degree,
            position: node.position,
        })
    }

    return {
        nodes: graph.nodes
            .filter((node) => !foldedNodeIds.has(node.id))
            .map((node) => mapNodeToCyElement(node, foldedParentIds)),

        edges: graph.edges
            .filter((edge) => !foldedNodeIds.has(edge.source) && !foldedNodeIds.has(edge.target))
            .map((edge) => mapEdgeToCyElement(edge, nodeLookup)),
    }
}
