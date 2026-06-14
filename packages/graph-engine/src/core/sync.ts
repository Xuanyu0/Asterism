/**
 * sync.ts
 *
 * 功能：
 *     图数据一致性同步函数。度数变更后，将源节点的度数同步到引用节点。
 *
 * 总体结构：
 *     1. syncReferenceNodeDegree — 源节点度数变更后同步到同图引用节点
 *
 * 规则：
 *     1. 引用节点的度数跟随源节点，不独立计算。
 *     2. 跨图引用节点由 Phase 3 GraphRegistry 处理。
 *
 * 外部如何使用：
 *     import { syncReferenceNodeDegree } from './sync'
 */

import type { NodeData, NodeId } from '../types/graph_data'

/**
 * 功能：
 *     度数变更后，将 source 节点的度数同步到同图内所有指向它的引用节点。
 *
 * 规则：
 *     引用节点的度数跟随源节点，不独立计算。
 *     跨图引用节点（sourceGraphId !== 本图 id）由 Phase 3 GraphRegistry 处理。
 */
export function syncReferenceNodeDegree(nodes: NodeData[], graphId: string, sourceNodeId: NodeId): NodeData[] {
    const sourceNode = nodes.find(node => node.id === sourceNodeId)

    if (!sourceNode || sourceNode.role !== 'knowledge') return nodes

    return nodes.map(node => {
        if (node.role === 'reference' && node.sourceGraphId === graphId && node.sourceNodeId === sourceNodeId) {
            return { ...node, degree: sourceNode.degree }
        }

        return node
    })
}
