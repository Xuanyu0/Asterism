/**
 * GraphData → Cytoscape CSS class 语义映射。
 */

import type { EdgeData, NodeData, NodeId } from '@my-project/graph-engine'

import { deriveNodeForm } from '@my-project/graph-engine'

/**
 * 根据 NodeData 生成 Cytoscape 节点 class（只读，不修改节点数据）。
 *
 * @param node - 源节点数据
 * @param foldedParentIds - 有折叠依赖的父节点 id 集合（命中时追加 has-folded-deps）
 * @returns class 名数组。
 */
export function getNodeClasses(
    node: NodeData,
    foldedParentIds?: Set<NodeId>,
): string[] {
    const classes: string[] = []

    if (node.role === 'knowledge') {
        classes.push(`node-${node.kind}`)
        // form 为派生值（childGraphId 有无决定 atomic / abstract），读取时计算
        classes.push(`node-${deriveNodeForm(node)}`)
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
 * 根据 EdgeData 生成 Cytoscape 边 class（只读，不修改边数据）。
 *
 * @param edge - 源边数据
 * @returns class 名数组（`edge-{kind}` 与 `edge-{direction}`）。
 */
export function getEdgeClasses(edge: EdgeData): string[] {
    return [`edge-${edge.kind}`, `edge-${edge.direction}`].filter(
        (className) => className.length > 0,
    )
}
