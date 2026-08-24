/**
 * 功能：
 *
 *     从 GraphData.cognitiveState 提取折叠过滤信息。
 *
 *     被折叠隐藏的节点不应进入 Cytoscape 渲染结果。
 *     拥有折叠依赖的父节点需施加额外 CSS class。
 */

import type { GraphData, NodeId } from '@my-project/graph-engine'

interface FoldFilter {
    /** 被折叠隐藏的节点 ID 集合。这些节点及其边不进入渲染。 */
    foldedNodeIds: Set<NodeId>
    /** 拥有折叠依赖的父节点 ID 集合。这些节点需施加 .has-folded-deps class。 */
    foldedParentIds: Set<NodeId>
}

/**
 * 功能：
 *
 *     从 GraphData 提取折叠过滤信息。
 */
export function extractFoldFilter(graph: GraphData): FoldFilter {
    const foldedDeps = graph.cognitiveState.foldedDependencies
    return {
        foldedNodeIds: new Set(
            foldedDeps.flatMap((state) => state.foldedNodeIds),
        ),
        foldedParentIds: new Set(foldedDeps.map((state) => state.targetNodeId)),
    }
}
