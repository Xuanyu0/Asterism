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
 *     2. DeconstructResult — 返回类型（扩展 ComposeResult，含 childGraph）
 *     3. deconstruct       — 唯一入口
 *
 * 规则：
 *
 *     1. 目标节点必须 role=knowledge、kind=real、form=atomic。
 *     2. 父图层边保持不变。子图内每个邻居一个沟通节点，不自动互连。
 *     3. 子图不经过 applyBatch——executeOperation 签名无法表达"创建新图"。
 *        compose 层直接构造完整 childGraph，由调用方 registerNewGraph 写入。
 *     4. 纯函数——不持有状态，不写入 graph_store。
 *
 * 外部如何使用：
 *
 *     import { deconstruct } from '@my-project/graph-engine'
 *
 *     const result = deconstruct({ nodeId, parentGraph })
 *     // result.operations → applyBatch(parentGraph, result.operations)
 *     // result.childGraph → graphStore.registerNewGraph(result.childGraph)
 */

import type { GraphData, NodeId, NodePosition } from '../../types/graph_data'
import type { ComposeIssue } from '../types'
import { generateGraphId, generateNodeId } from '../../core/id'

// ═══════════ 参数 & 返回值类型 ═══════════

/**
 * 功能：
 *
 *     解构操作输入参数。
 *
 * 规则：
 *
 *     parentGraph 是目标节点当前所在的图。 */
export interface DeconstructParams {
    /** 待解构的目标节点 ID。 */
    nodeId: NodeId

    /** 目标节点所在的父图。 */
    parentGraph: GraphData
}

/**
 * 功能：
 *
 *     解构操作返回值。
 *
 * 规则：
 *
 *     childGraph 由 compose 层直接构造——不经过 add_graph 操作。
 *     调用方在 applyBatch 父图 ops 后，调 graphStore.registerNewGraph(childGraph) 写入。
 */
export interface DeconstructResult {
    /** 待 applyBatch 的父图侧操作序列。 */
    operations: { type: 'update_node'; node: GraphData['nodes'][number] }[]

    /** 语义预检 / 原子操作校验的问题列表。含 error 时确认按钮灰掉。 */
    issues: ComposeIssue[]

    /** 新建的子图对象（含沟通节点）。调用方负责注册。 */
    childGraph: GraphData | null
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
 *     2. 父图 ops：一条 update_node——form 改为 'abstract'，绑定 childGraphId。
 *     3. 子图：直接构造完整 GraphData，每个邻居一个 communication 引用节点。
 *
 * 参数：
 *
 *     见 DeconstructParams。
 */
export function deconstruct(params: DeconstructParams): DeconstructResult {
    const { nodeId, parentGraph } = params
    const issues: ComposeIssue[] = []

    // ── 语义预检 ──

    const targetNode = parentGraph.nodes.find(node => node.id === nodeId)

    if (!targetNode) {
        issues.push({
            message: `节点 ${nodeId} 在当前图谱中不存在。`,
            severity: 'error',
        })
        return { operations: [], issues, childGraph: null }
    }

    if (targetNode.role !== 'knowledge') {
        issues.push({
            message: `节点 ${nodeId} 不是知识节点，不能解构。`,
            severity: 'error',
        })
        return { operations: [], issues, childGraph: null }
    }

    if (targetNode.kind !== 'real') {
        issues.push({
            message: `节点 ${nodeId} 是虚节点，不能解构。`,
            severity: 'error',
        })
        return { operations: [], issues, childGraph: null }
    }

    if (targetNode.form === 'abstract') {
        issues.push({
            message: `节点 ${nodeId} 已是抽象节点，不能重复解构。`,
            severity: 'error',
        })
        return { operations: [], issues, childGraph: null }
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

    // ── 构造父图 ops ──

    const updatedNode = {
        ...targetNode,
        form: 'abstract' as const,
        childGraphId,
        updatedAt: now,
    }

    const operations = [{
        type: 'update_node' as const,
        node: updatedNode,
    }]

    return { operations, issues, childGraph }
}
