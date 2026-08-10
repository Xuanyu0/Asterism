/**
 * 功能：
 *
 *     GraphData → Cytoscape CSS class 语义映射。
 */

import type { EdgeData, NodeData, NodeId } from '@my-project/graph-engine'

/**
 * 功能：
 *
 *     根据 NodeData 生成 Cytoscape 节点 class。
 *
 * 规则：
 *
 *     1. 只读取节点字段。
 *     2. 不修改节点数据。
 */
export function getNodeClasses(
    node: NodeData,
    foldedParentIds?: Set<NodeId>,
): string[] {
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
 *
 *     根据 EdgeData 生成 Cytoscape 边 class。
 *
 * 规则：
 *
 *     1. 只读取边字段。
 *     2. 不修改边数据。
 */
export function getEdgeClasses(edge: EdgeData): string[] {
    return [`edge-${edge.kind}`, `edge-${edge.direction}`].filter(
        (className) => className.length > 0,
    )
}
