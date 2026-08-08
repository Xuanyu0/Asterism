/**
 * internalize.ts
 *
 * 功能：
 *
 *     内化编排。将知识节点从工作区转移到常识层，清空边结构，节点本身保留。
 *
 * 总体结构：
 *
 *     1. InternalizeParams — 输入参数
 *     2. internalize      — 唯一入口
 *
 * 规则：
 *
 *     1. 引用节点在原图直接删除，不转移至常识层。
 *     2. 原子节点：删边 → 删节点 → 常识层 add_node（scatterInCircle 散布）。
 *     3. 抽象节点：删边 → 递归清理子图 → 删节点 → 常识层 add_node。
 *        子图内知识节点保留原坐标一并移入常识层。
 *     4. 常识层位置迭代：scatterInCircle 半径递增，永不失败。
 *     5. 纯函数——不持有状态，不写入 graph_store。
 *
 * 外部如何使用：
 *
 *     import { internalize } from '@my-project/graph-engine'
 *
 *     const result = internalize({ nodeIds, parentGraph, commonLayer, lookupGraph, nodeRadiusOverrides })
 *     // applyBatch(parentGraph, result.operations.parent)
 *     // applyBatch(commonLayer, result.operations.commonLayer)
 */

import type { GraphData, NodeId, NodePosition } from '../../types/graph_data'
import type { GraphLookup, NodeRadiusMap } from '../../types/infrastructure_types'
import type { ComposeIssue } from '../../types/compose_types'
import type { GraphOperation } from '../../types/atomic_operations'
import { generateNodeId } from '../../core/utils/id'
import { scatterInCircle } from '../../infrastructure/placement'
import { hasCollisionAt, hasCollisionInDrafts } from '../../infrastructure/collision'
import { DEFAULT_LAYOUT_RULES } from '../../core/layout_rules'

// ═══════════ 常量 ═══════════

const unitDistance = DEFAULT_LAYOUT_RULES.unitDistance

// ═══════════ 参数类型 ═══════════

/**
 * 功能：
 *
 *     内化操作输入参数。
 */
export interface InternalizeParams {
    /** 待内化的节点 ID 列表。 */
    nodeIds: NodeId[]

    /** 被选节点所在的父图。 */
    parentGraph: GraphData

    /** 常识层图（kind = 'commonLayer'）。 */
    commonLayer: GraphData

    /** 跨图查询函数。给定 graphId 返回对应 GraphData 或 undefined。 */
    lookupGraph: GraphLookup

    /** 节点半径覆盖表。 */
    nodeRadiusOverrides: NodeRadiusMap
}

// ═══════════ internalize ═══════════

/**
 * 功能：
 *
 *     内化：将知识节点转移至常识层。引用节点在原图直接删除。
 *
 * 规则：
 *
 *     1. 语义预检：非空、至少一个 knowledge 节点、节点存在。
 *     2. 父图 ops：delete_edge（所有连接边）→ delete_node。
 *        抽象节点额外递归清理子图（删沟通节点和普通边）。
 *     3. 常识层 ops：add_node（scatterInCircle 散布，degree = 0）。
 *
 * 参数：
 *
 *     见 InternalizeParams。
 */
export function internalize(params: InternalizeParams): {
    operations: { parent: GraphOperation[]; child: GraphOperation[]; commonLayer: GraphOperation[] }
    issues: ComposeIssue[]
} {
    const { nodeIds, parentGraph, commonLayer, lookupGraph, nodeRadiusOverrides } = params
    const issues: ComposeIssue[] = []

    // ── 语义预检 ──

    if (nodeIds.length < 1) {
        issues.push({
            severity: 'error',
            code: 'INTERNALIZE_EMPTY_SELECTION',
            message: `内化操作至少需要一个节点。`,
        })
        return { operations: { parent: [], child: [], commonLayer: [] }, issues }
    }

    // 收集节点（可能在父图或子图中）
    interface ResolvedNode {
        node: GraphData['nodes'][number]
        graph: GraphData
    }

    const resolvedNodes: ResolvedNode[] = []
    const notFoundIds: string[] = []

    for (const nodeId of nodeIds) {
        const found = findNodeInGraphOrChildGraphs(nodeId, parentGraph, lookupGraph)
        if (found) {
            resolvedNodes.push(found)
        } else {
            notFoundIds.push(nodeId)
        }
    }

    if (notFoundIds.length > 0) {
        for (const missingId of notFoundIds) {
            issues.push({
                severity: 'error',
                code: 'INTERNALIZE_TARGET_NOT_FOUND',
                message: `节点 ${missingId} 在当前图谱及其子图中均不存在。`,
            })
        }
        return { operations: { parent: [], child: [], commonLayer: [] }, issues }
    }

    // 分类：引用节点 vs 知识节点
    const referenceNodes = resolvedNodes.filter(r => r.node.role === 'reference')
    const knowledgeNodes = resolvedNodes.filter(r => r.node.role === 'knowledge')

    if (knowledgeNodes.length === 0) {
        issues.push({
            severity: 'error',
            code: 'INTERNALIZE_ONLY_REFERENCE_NODES',
            message: `所有目标节点均为引用节点，不存在可内化的知识节点。引用节点已在原图中自动删除。`,
        })
        return { operations: { parent: [], child: [], commonLayer: [] }, issues }
    }

    for (const rn of knowledgeNodes) {
        if (rn.node.role === 'knowledge' && rn.node.kind === 'real' && rn.node.form === 'abstract') {
            issues.push({
                severity: 'warning',
                code: 'INTERNALIZE_ABSTRACT_NODE_RECURSIVE',
                message: `节点 ${rn.node.id} 是抽象节点，其子图内的沟通节点将被一并删除。`,
            })
        }
    }

    // ── 构造原图 ops（按图分组） ──

    const parentOps: GraphOperation[] = []
    const childOps: GraphOperation[] = []
    const now = new Date().toISOString()

    // 1. 引用节点：直接 delete_node（在对应图中删除）
    for (const rn of referenceNodes) {
        if (rn.graph.id === parentGraph.id) {
            parentOps.push({ type: 'delete_node', nodeId: rn.node.id })
        } else {
            childOps.push({ type: 'delete_node', nodeId: rn.node.id })
        }
    }

    // 2. 原子/抽象知识节点：先删边，再删节点
    for (const kn of knowledgeNodes) {
        const nodeId = kn.node.id
        const graph = kn.graph
        const ops = graph.id === parentGraph.id ? parentOps : childOps

        // 删除连接到该节点的所有边
        const connectedEdges = graph.edges.filter(
            edge => edge.source === nodeId || edge.target === nodeId,
        )
        for (const edge of connectedEdges) {
            ops.push({ type: 'delete_edge', edgeId: edge.id })
        }

        // 抽象节点：递归清理子图
        if (kn.node.role === 'knowledge' && kn.node.form === 'abstract' && kn.node.childGraphId) {
            const childGraphId = kn.node.childGraphId
            const childGraph = lookupGraph(childGraphId)

            if (childGraph) {
                // 删除子图内所有普通边
                for (const edge of childGraph.edges) {
                    childOps.push({ type: 'delete_edge', edgeId: edge.id })
                }

                // 删除子图内所有沟通节点
                const commNodes = childGraph.nodes.filter(
                    node => node.role === 'reference' && node.referenceKind === 'communication',
                )
                for (const commNode of commNodes) {
                    childOps.push({ type: 'delete_node', nodeId: commNode.id })
                }
            }
        }

        // 删除节点本身
        ops.push({ type: 'delete_node', nodeId })
    }

    // ── 收集所有需要迁入常识层的知识节点 ──

    interface KnowledgeToMove {
        node: GraphData['nodes'][number]
    }

    const toMove: KnowledgeToMove[] = []

    for (const kn of knowledgeNodes) {
        toMove.push({ node: kn.node })

        // 抽象节点：子图内知识节点也一并迁入
        if (kn.node.role === 'knowledge' && kn.node.form === 'abstract' && kn.node.childGraphId) {
            const childGraph = lookupGraph(kn.node.childGraphId)
            if (childGraph) {
                for (const childNode of childGraph.nodes) {
                    if (childNode.role === 'knowledge') {
                        toMove.push({ node: childNode })
                    }
                }
            }
        }
    }

    // ── 常识层 ops：逐个安置，迭代扩展半径 ──

    const commonOps: GraphOperation[] = []
    const placedDrafts: { nodeId: NodeId; position: NodePosition }[] = []

    for (const item of toMove) {
        let nodePosition: NodePosition | null = null
        let radius = unitDistance

        while (true) {
            const candidate = scatterInCircle({ x: 0, y: 0 }, radius)

            // 检测 vs 常识层已有节点 + 同批已放置节点
            const hitsExisting = hasCollisionAt(
                item.node.id, candidate, commonLayer.nodes, nodeRadiusOverrides,
            )
            const hitsPeer = hasCollisionInDrafts(
                [{ nodeId: item.node.id, position: candidate }],
                placedDrafts.map(d => ({
                    id: d.nodeId,
                    graphId: commonLayer.id,
                    role: 'knowledge' as const,
                    label: '',
                    degree: 0,
                    position: d.position,
                    abstractionLevel: 0,
                    kind: 'real' as const,
                })),
                nodeRadiusOverrides,
            )

            if (!hitsExisting && !hitsPeer) {
                nodePosition = candidate
                break
            }

            radius += unitDistance
        }

        placedDrafts.push({ nodeId: item.node.id, position: nodePosition })

        commonOps.push({
            type: 'add_node',
            node: {
                ...item.node,
                id: item.node.role === 'knowledge' ? item.node.id : generateNodeId(),
                graphId: commonLayer.id,
                degree: 0,
                position: nodePosition,
                createdAt: now,
                updatedAt: now,
            },
        })
    }

    return { operations: { parent: parentOps, child: childOps, commonLayer: commonOps }, issues }
}

// ═══════════ 内部 ═══════════

/**
 * 功能：
 *
 *     在指定图及其子图中递归查找节点。
 */
function findNodeInGraphOrChildGraphs(
    nodeId: NodeId,
    graph: GraphData,
    lookupGraph: GraphLookup,
): { node: GraphData['nodes'][number]; graph: GraphData } | null {
    const node = graph.nodes.find(node => node.id === nodeId)
    if (node) return { node, graph }

    // 递归搜索子图（抽象节点的 childGraphId）
    for (const maybeAbstract of graph.nodes) {
        if (maybeAbstract.role === 'knowledge' && maybeAbstract.form === 'abstract' && maybeAbstract.childGraphId) {
            const childGraph = lookupGraph(maybeAbstract.childGraphId)
            if (childGraph) {
                const found = findNodeInGraphOrChildGraphs(nodeId, childGraph, lookupGraph)
                if (found) return found
            }
        }
    }

    return null
}
