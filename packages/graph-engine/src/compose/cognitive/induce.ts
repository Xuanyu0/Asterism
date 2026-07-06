/**
 * induce.ts
 *
 * 功能：
 *
 *     归纳编排。将多个节点归纳到一个抽象节点下，创建子图并生成沟通节点。
 *
 * 总体结构：
 *
 *     1. InduceParams — 输入参数
 *     2. induce       — 唯一入口
 *
 * 规则：
 *
 *     1. 执行顺序：先子图后父图。子图先落位被选节点和沟通节点，父图再做删除重建。
 *     2. 沟通节点仅存在于子图。父图侧抽象节点直接连接未选邻居。
 *     3. 沟通节点初始同层，理想轨道半径包裹所有被选节点，碰撞时 D0 递增重试。
 *     4. 纯函数——不持有状态，不写入 graph_store。
 *
 * 外部如何使用：
 *
 *     import { induce } from '@my-project/graph-engine'
 *
 *     const result = induce({ nodeIds, parentGraph, lookupGraph, nodeRadiusOverrides, allEdges })
 *     // applyBatch(result.childGraphData, result.operations.child)
 *     // applyBatch(parentGraph, result.operations.parent)
 */

import type { EdgeData, GraphData, NodeId, NodePosition } from '../../types/graph_data'
import type { GraphLookup, NodeRadiusMap } from '../../types/infrastructure_types'
import type { ComposeIssue } from '../../types/compose_types'
import type { GraphOperation } from '../../types/atomic_operations'
import { generateGraphId, generateNodeId, generateEdgeId } from '../../core/id'
import { distributeOnTiers, scatterInCircle } from '../../infrastructure/placement'
import type { TierAssignment } from '../../infrastructure/placement'
import { hasCollisionInDrafts, hasCollisionAt } from '../../infrastructure/collision'
import { distance } from '../../infrastructure/geometry'
import { DEFAULT_LAYOUT_RULES } from '../../core/rules'

// ═══════════ 常量 ═══════════

const R0 = DEFAULT_LAYOUT_RULES.r0

/** 碰撞重试最大次数。 */
const MAX_RETRIES = 20

// ═══════════ 参数类型 ═══════════

/**
 * 功能：
 *
 *     归纳操作输入参数。
 */
export interface InduceParams {
    /** 被选节点 ID 列表（≥2 个）。 */
    nodeIds: NodeId[]

    /** 被选节点所在的父图。 */
    parentGraph: GraphData

    /** 跨图查询函数。给定 graphId 返回对应 GraphData 或 undefined。 */
    lookupGraph: GraphLookup

    /** 节点半径覆盖表。 */
    nodeRadiusOverrides: NodeRadiusMap

    /** 当前图谱中的边快照。 */
    allEdges: EdgeData[]
}

// ═══════════ induce ═══════════

/**
 * 功能：
 *
 *     归纳：多节点 → 抽象节点 + 子图 + 沟通节点。
 *
 * 规则：
 *
 *     1. 语义预检：≥2 节点、全部存在、无沟通节点、无重边冲突。
 *     2. 子图 ops：add_graph + add_node（被选节点 + 沟通节点）+ add_edge（被选→沟通）。
 *     3. 父图 ops：add_node（抽象节点）+ delete_node（被选）+ add_edge（抽象→邻居）。
 *
 * 参数：
 *
 *     见 InduceParams。
 */
export function induce(params: InduceParams): {
    operations: { child: GraphOperation[]; parent: GraphOperation[] }
    childGraphData: GraphData
    issues: ComposeIssue[]
} {
    const { nodeIds, parentGraph, nodeRadiusOverrides, allEdges } = params
    const issues: ComposeIssue[] = []

    // ── 语义预检 ──

    if (nodeIds.length < 2) {
        issues.push({
            severity: 'error',
            code: 'INDUCE_INSUFFICIENT_NODES',
            message: `归纳操作至少需要两个节点。`,
        })
        return { operations: { child: [], parent: [] }, childGraphData: null!, issues }
    }

    const selectedSet = new Set(nodeIds)
    const selectedNodes = parentGraph.nodes.filter(node => selectedSet.has(node.id))

    if (selectedNodes.length !== nodeIds.length) {
        const foundIds = new Set(selectedNodes.map(node => node.id))
        for (const missingId of nodeIds.filter(id => !foundIds.has(id))) {
            issues.push({
                severity: 'error',
                code: 'INDUCE_TARGET_NOT_FOUND',
                message: `节点 ${missingId} 在当前图谱中不存在。`,
            })
        }
        return { operations: { child: [], parent: [] }, childGraphData: null!, issues }
    }

    for (const node of selectedNodes) {
        if (node.role === 'reference' && node.referenceKind === 'communication') {
            issues.push({
                severity: 'error',
                code: 'INDUCE_COMMUNICATION_NODE_FORBIDDEN',
                message: `节点 ${node.id} 是沟通节点，不能参与归纳。沟通节点是父图邻居在子图中的透明投影，不应被二次归纳。`,
            })
            return { operations: { child: [], parent: [] }, childGraphData: null!, issues }
        }
    }

    // ── 识别 外部邻居 + 内部边 ──

    const neighborIds = new Set<NodeId>()
    const neighborEdgeMap = new Map<NodeId, EdgeData[]>() // neighborId → edges from selected nodes

    for (const edge of allEdges) {
        const sourceSelected = selectedSet.has(edge.source)
        const targetSelected = selectedSet.has(edge.target)

        if (sourceSelected && !targetSelected) {
            neighborIds.add(edge.target)
            const edges = neighborEdgeMap.get(edge.target) ?? []
            edges.push(edge)
            neighborEdgeMap.set(edge.target, edges)
        } else if (!sourceSelected && targetSelected) {
            neighborIds.add(edge.source)
            const edges = neighborEdgeMap.get(edge.source) ?? []
            edges.push(edge)
            neighborEdgeMap.set(edge.source, edges)
        }
    }

    const neighbors = parentGraph.nodes.filter(node => neighborIds.has(node.id))

    // ── 重边冲突检查 ──

    for (const [neighborId, edges] of neighborEdgeMap) {
        const seen = new Set<string>()
        for (const edge of edges) {
            // 归纳后边在子图中指向沟通节点：source 或 target 中被选的一端保持不变，
            // 另一端变为沟通节点 ID
            const projectedSource = selectedSet.has(edge.source) ? edge.source : `comm:${neighborId}`
            const projectedTarget = selectedSet.has(edge.target) ? edge.target : `comm:${neighborId}`
            const key = `${projectedSource}|${projectedTarget}|${edge.kind}|${edge.direction}`

            if (seen.has(key)) {
                issues.push({
                    severity: 'error',
                    code: 'INDUCE_DUPLICATE_EDGE_CONFLICT',
                    message: `归纳操作将对邻居 ${neighborId} 产生重边冲突（kind=${edge.kind}, direction=${edge.direction}），当前不支持此拓扑。`,
                })
                return { operations: { child: [], parent: [] }, childGraphData: null!, issues }
            }
            seen.add(key)
        }
    }

    // ── 计算形心 ──

    const nodesWithPos = selectedNodes.filter(node => node.position)
    if (nodesWithPos.length === 0) {
        issues.push({
            severity: 'error',
            code: 'INDUCE_NO_POSITION',
            message: `被选节点均无位置信息，无法计算形心。`,
        })
        return { operations: { child: [], parent: [] }, childGraphData: null!, issues }
    }

    const centroid: NodePosition = {
        x: nodesWithPos.reduce((sum, node) => sum + node.position!.x, 0) / nodesWithPos.length,
        y: nodesWithPos.reduce((sum, node) => sum + node.position!.y, 0) / nodesWithPos.length,
    }

    // ── 子图 ID 与时间戳 ──

    const childGraphId = generateGraphId()
    const now = new Date().toISOString()

    // ── 半径辅助 ──

    function getNodeRadius(node: { id: NodeId; degree: number }): number {
        return nodeRadiusOverrides.get(node.id) ?? R0 * Math.sqrt(1 + node.degree)
    }

    // ── 确定沟通节点位置（碰撞则迭代） ──

    const maxCommRadius = R0  // 沟通节点 degree = 0，radius = R0

    let commDrafts: { nodeId: NodeId; position: NodePosition }[] = []
    let commPositionsFound = false

    if (neighbors.length > 0) {
        const commNodeIds = neighbors.map(() => generateNodeId())

        // 模拟子图：被选节点迁入后
        const simulatedNodes = selectedNodes.map(node => ({
            ...node,
            graphId: childGraphId,
            position: node.position ?? { x: 0, y: 0 },
        }))

        const satelliteSpecs = neighbors.map((_neighbor, i) => ({ id: commNodeIds[i]!, radius: maxCommRadius }))
        const tiers: TierAssignment[] = [{ tier: 0, nodeIds: commNodeIds }]

        // 最远被选节点距形心的距离。distributeOnTiers 内部 D0 = centerRadius + maxSatR + R0，
        // 将 centerRadius 设为此值即得 idealOrbitRadius = maxSelectedDist + maxCommRadius + R0。
        let centerRadius = Math.max(
            ...selectedNodes.map(node => {
                if (!node.position) return 0
                return distance(node.position, centroid) + getNodeRadius(node)
            }),
        )

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const vCenter = { id: '__virtual__' as NodeId, position: centroid, radius: centerRadius }
            const positions = distributeOnTiers(vCenter, satelliteSpecs, tiers, 0)

            if (!hasCollisionInDrafts(positions, simulatedNodes, nodeRadiusOverrides)) {
                commDrafts = positions
                commPositionsFound = true
                break
            }

            centerRadius += R0
        }

        if (!commPositionsFound) {
            issues.push({
                severity: 'error',
                code: 'INDUCE_COMM_NODE_PLACEMENT_FAILED',
                message: `无法为沟通节点找到不碰撞的位置（已重试 ${MAX_RETRIES} 次）。`,
            })
            return { operations: { child: [], parent: [] }, childGraphData: null!, issues }
        }
    }

    // ── 构造沟通节点 ──

    const commNodeMap = new Map<NodeId, NodeId>() // neighborId → commNodeId
    const communicationNodes: GraphData['nodes'] = []

    for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i]!
        const draft = commDrafts[i]
        const commId = draft?.nodeId ?? generateNodeId()
        const position = draft?.position ?? { x: centroid.x, y: centroid.y }

        commNodeMap.set(neighbor.id, commId)

        communicationNodes.push({
            id: commId,
            graphId: childGraphId,
            role: 'reference' as const,
            referenceKind: 'communication' as const,
            label: neighbor.label,
            sourceGraphId: parentGraph.id,
            sourceNodeId: neighbor.id,
            position,
            abstractionLevel: 0,
            degree: 0,
            createdAt: now,
            updatedAt: now,
        })
    }

    // ── 构造子图 ops ──

    const childOps: GraphOperation[] = []

    // 空子图
    const emptyChildGraph: GraphData = {
        id: childGraphId,
        kind: 'subgraph',
        title: selectedNodes.map(node => node.label).join(' / '),
        parentGraphId: parentGraph.id,
        ownerNodeId: '', // 由后续 abstract node 的 id 回填——此处暂空，add_graph 后 update
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now,
    }

    childOps.push({ type: 'add_graph', graph: emptyChildGraph })

    // 被选节点移入子图
    for (const node of selectedNodes) {
        childOps.push({
            type: 'add_node',
            node: {
                ...node,
                graphId: childGraphId,
                updatedAt: now,
            },
        })
    }

    // 沟通节点
    for (const commNode of communicationNodes) {
        childOps.push({ type: 'add_node', node: commNode })
    }

    // 外部边投影（子图内：被选节点 → 沟通节点）
    for (const [neighborId, edges] of neighborEdgeMap) {
        const commId = commNodeMap.get(neighborId)!

        for (const edge of edges) {
            const sourceInChild = selectedSet.has(edge.source) ? edge.source : commId
            const targetInChild = selectedSet.has(edge.target) ? edge.target : commId

            childOps.push({
                type: 'add_edge',
                edge: {
                    id: generateEdgeId(),
                    graphId: childGraphId,
                    source: sourceInChild,
                    target: targetInChild,
                    kind: edge.kind,
                    direction: edge.direction,
                    createdAt: now,
                    updatedAt: now,
                },
            })
        }
    }

    // 内部边：被选节点之间的边移入子图
    for (const edge of allEdges) {
        if (selectedSet.has(edge.source) && selectedSet.has(edge.target)) {
            childOps.push({
                type: 'add_edge',
                edge: {
                    ...edge,
                    graphId: childGraphId,
                    updatedAt: now,
                },
            })
        }
    }

    // ── 抽象节点 ──

    const abstractId = generateNodeId()
    const abstractDegree = neighbors.length
    let abstractPosition = centroid

    // 碰撞检测：抽象节点 vs 父图剩余节点
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (!hasCollisionAt(abstractId, abstractPosition, parentGraph.nodes, nodeRadiusOverrides, selectedSet)) {
            break
        }

        if (attempt === MAX_RETRIES - 1) {
            issues.push({
                severity: 'error',
                code: 'INDUCE_ABSTRACT_NODE_PLACEMENT_FAILED',
                message: `无法为抽象节点找到不碰撞的位置（已重试 ${MAX_RETRIES} 次）。`,
            })
            return { operations: { child: [], parent: [] }, childGraphData: null!, issues }
        }

        abstractPosition = scatterInCircle(centroid, R0 * (attempt + 1))
    }

    // 回填 childGraph 的 ownerNodeId
    const childGraph: GraphData = {
        ...emptyChildGraph,
        ownerNodeId: abstractId,
    }
    // 替换 childOps 中的 add_graph
    childOps[0] = { type: 'add_graph', graph: childGraph }

    // ── 构造父图 ops ──

    const parentOps: GraphOperation[] = []

    const abstractNode = {
        id: abstractId,
        graphId: parentGraph.id,
        role: 'knowledge' as const,
        kind: 'real' as const,
        form: 'abstract' as const,
        label: selectedNodes.map(node => node.label).join(' / '),
        degree: abstractDegree,
        position: abstractPosition,
        abstractionLevel: 0,
        childGraphId,
        createdAt: now,
        updatedAt: now,
    }

    parentOps.push({ type: 'add_node', node: abstractNode })

    // 删除被选节点
    for (const nodeId of nodeIds) {
        parentOps.push({ type: 'delete_node', nodeId })
    }

    // 抽象节点 连接 邻居
    for (const neighbor of neighbors) {
        // 从原始边中取 kind/direction——取第一条匹配的
        const originalEdges = neighborEdgeMap.get(neighbor.id) ?? []
        const firstEdge = originalEdges[0]

        parentOps.push({
            type: 'add_edge',
            edge: {
                id: generateEdgeId(),
                graphId: parentGraph.id,
                source: abstractId,
                target: neighbor.id,
                kind: firstEdge?.kind ?? 'real',
                direction: firstEdge?.direction ?? 'undirected',
                createdAt: now,
                updatedAt: now,
            },
        })
    }

    return { operations: { child: childOps, parent: parentOps }, childGraphData: childGraph, issues }
}
