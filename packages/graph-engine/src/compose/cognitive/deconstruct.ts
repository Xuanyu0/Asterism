/**
 * deconstruct.ts
 *
 * 功能：
 *
 *     解构编排。将原子实节点转换为抽象节点，创建空子图并自动生成沟通节点。
 *
 * 总体结构：
 *
 *     1. DeconstructParams  — 输入参数
 *     2. deconstruct       — 唯一入口
 *
 * 规则：
 *
 *     1. 目标节点必须 role=knowledge、kind=real、form=atomic。
 *     2. 父图层边保持不变。子图内每个邻居一个沟通节点，不自动互连。
 *     3. 子图通过 add_graph 操作注册到 registry。applyBatch 统一执行。
 *     4. 纯函数——不持有状态，不写入 graph_store。
 *
 * 外部如何使用：
 *
 *     import { deconstruct } from '@my-project/graph-engine'
 *
 *     const result = deconstruct({ nodeId, parentGraph })
 *     // applyBatch(parentGraph, result.operations, registry)
 */

import type { GraphData, NodeId, NodePosition } from '../../types/graph_data'
import type { ComposeIssue } from '../../types/compose_types'
import type { GraphOperation } from '../../types/atomic_operations'
import { generateGraphId, generateNodeId } from '../../core/id'

// ═══════════ 参数类型 ═══════════

/**
 * 功能：
 *
 *     解构操作输入参数。
 */
export interface DeconstructParams {
    /** 待解构的目标节点 ID。 */
    nodeId: NodeId

    /** 目标节点所在的父图。 */
    parentGraph: GraphData
}

// ═══════════ deconstruct ═══════════

/**
 * 功能：
 *
 *     解构：原子实节点 → 抽象节点 + 空子图 + 沟通节点。
 *
 * 规则：
 *
 *     1. 语义预检：nodeId 必须存在于 parentGraph，且 role=knowledge、kind=real、form=atomic。
 *     2. 父图 ops：update_node（form → 'abstract'）+ add_graph（空子图含沟通节点）。
 *     3. 子图：直接构造完整 GraphData，每个邻居一个 communication 引用节点。
 *
 * 参数：
 *
 *     见 DeconstructParams。
 */
export function deconstruct(params: DeconstructParams): {
    operations: GraphOperation[]
    issues: ComposeIssue[]
} {
    const { nodeId, parentGraph } = params
    const issues: ComposeIssue[] = []

    // ── 语义预检 ──

    const targetNode = parentGraph.nodes.find(node => node.id === nodeId)

    if (!targetNode) {
        issues.push({
            severity: 'error',
            code: 'DECONSTRUCT_TARGET_NOT_FOUND',
            message: `节点 ${nodeId} 在当前图谱中不存在。`,
        })
        return { operations: [], issues }
    }

    if (targetNode.role !== 'knowledge') {
        issues.push({
            severity: 'error',
            code: 'DECONSTRUCT_TARGET_NOT_KNOWLEDGE',
            message: `节点 ${nodeId} 不是知识节点，不能解构。`,
        })
        return { operations: [], issues }
    }

    if (targetNode.kind !== 'real') {
        issues.push({
            severity: 'error',
            code: 'DECONSTRUCT_TARGET_VIRTUAL',
            message: `节点 ${nodeId} 是虚节点，不能解构。`,
        })
        return { operations: [], issues }
    }

    if (targetNode.form === 'abstract') {
        issues.push({
            severity: 'error',
            code: 'DECONSTRUCT_TARGET_ALREADY_ABSTRACT',
            message: `节点 ${nodeId} 已是抽象节点，不能重复解构。`,
        })
        return { operations: [], issues }
    }

    // ── 查找邻居 ──

    const neighborIds = new Set<NodeId>()
    for (const edge of parentGraph.edges) {
        if (edge.source === nodeId) {
            neighborIds.add(edge.target)
        }
        if (edge.target === nodeId) {
            neighborIds.add(edge.source)
        }
    }

    const neighbors = parentGraph.nodes.filter(node => neighborIds.has(node.id))

    // ── 构造子图 ──

    const childGraphId = generateGraphId()
    const now = new Date().toISOString()

    const communicationNodes = neighbors.map(neighbor => ({
        id: generateNodeId(),
        graphId: childGraphId,
        role: 'reference' as const,
        referenceKind: 'communication' as const,
        label: neighbor.label,
        sourceGraphId: parentGraph.id,
        sourceNodeId: neighbor.id,
        position: { x: 0, y: 0 } as NodePosition,
        abstractionLevel: 0,
        degree: 0,
        createdAt: now,
        updatedAt: now,
    }))

    const childGraph: GraphData = {
        id: childGraphId,
        kind: 'subgraph',
        title: targetNode.label,
        parentGraphId: parentGraph.id,
        ownerNodeId: nodeId,
        nodes: communicationNodes,
        edges: [],
        createdAt: now,
        updatedAt: now,
    }

    // ── 构造原子操作序列 ──

    const updatedNode = {
        ...targetNode,
        form: 'abstract' as const,
        childGraphId,
        updatedAt: now,
    }

    const operations: GraphOperation[] = [
        { type: 'update_node', node: updatedNode },
        { type: 'add_graph', graph: childGraph },
    ]

    return { operations, issues }
}
