/**
 * diverge.ts
 *
 * 功能：
 *
 *     发散编排。在两个知识节点间创建有向虚边，必要时创建启发节点并自动镜像。
 *
 * 总体结构：
 *
 *     1. DivergeParams      — 输入参数
 *     2. DraftHeuristicPosition — 跨图草稿（含 graphId）
 *     3. diverge            — 唯一入口
 *
 * 规则：
 *
 *     1. 边始终在 currentGraph 内。跨图时创建启发节点作为异图知识节点的本地代理。
 *     2. 每次调用最多创建一个启发节点。镜像自动完成，在同一事务内。
 *     3. 禁止链式引用（ref → ref）：边的两端点至少一个为 knowledge。
 *     4. 纯函数——不持有状态，不写入 graph_store。
 *
 * 外部如何使用：
 *
 *     import { diverge } from '@my-project/graph-engine'
 *
 *     const result = diverge({
 *         sourceNodeId, targetNodeId, currentGraph,
 *         heuristicPosition, registry,
 *     })
 *     // result.operations.current → applyBatch(currentGraph, result.operations.current)
 *     // result.operations.peer     → applyBatch(peerGraph, result.operations.peer)
 */

import type { EdgeData, GraphData, GraphId, NodeId, NodePosition } from '../../types/graph_data'
import type { GraphLookup, NodeRadiusMap } from '../../types/infrastructure_types'
import type { ComposeIssue, DraftPosition } from '../../types/compose_types'
import type { GraphOperation } from '../../types/atomic_operations'
import { generateNodeId, generateEdgeId } from '../../core/id'
import { scatterInCircle } from '../../infrastructure/placement'
import { hasCollisionAt } from '../../infrastructure/collision'

// ═══════════ 参数 & 返回值类型 ═══════════

/**
 * 功能：
 *
 *     发散操作输入参数。
 *
 * 规则：
 *
 *     heuristicPosition — null 表示两个节点都在当前图，直接连边。
 *                         非 null 表示其中一个节点不在当前图，在点击位置创建启发节点。
 */
export interface DivergeParams {
    /** 边的起点（知识节点 ID）。 */
    sourceNodeId: NodeId

    /** 边的终点（知识节点 ID）。 */
    targetNodeId: NodeId

    /** 用户当前操作的图。边始终建在此图内。 */
    currentGraph: GraphData

    /** 用户点击空白处的位置。null = 两节点都在当前图。 */
    heuristicPosition: NodePosition | null

    /** 跨图查询函数。给定 graphId 返回对应 GraphData 或 undefined。 */
    lookupGraph: GraphLookup

    /** 已注册图谱的全部 ID 列表，用于跨图查找节点所属图。 */
    graphIds: GraphId[]
}

/**
 * 功能：
 *
 *     带 graphId 的位置草稿。用于跨图前端渲染。
 */
interface DraftHeuristicPosition extends DraftPosition {
    /** 草稿所在的图 ID。 */
    graphId: string
}

// ═══════════ 常量 ═══════════

/** 镜像启发节点散布最大半径。 */
const MAX_SCATTER_RADIUS = 300

/** 随机空位查找最大重试次数。 */
const MAX_ATTEMPTS = 20

// ═══════════ diverge ═══════════

/**
 * 功能：
 *
 *     发散：在两个知识节点间创建有向虚边。
 *
 * 规则：
 *
 *     1. heuristicPosition === null → Case A：两节点都在当前图，直接 add_edge。
 *     2. heuristicPosition !== null → Case B：创建启发节点 + add_edge + 镜像。
 *     3. 禁止链式引用 ref → ref。
 *
 * 参数：
 *
 *     见 DivergeParams。
 */
export function diverge(params: DivergeParams): {
    operations: { current: GraphOperation[]; peer: GraphOperation[] }
    drafts: DraftHeuristicPosition[]
    issues: ComposeIssue[]
} {
    const { sourceNodeId, targetNodeId, currentGraph, heuristicPosition, lookupGraph, graphIds } = params
    const issues: ComposeIssue[] = []

    const sourceInCurrent = currentGraph.nodes.some(node => node.id === sourceNodeId)
    const targetInCurrent = currentGraph.nodes.some(node => node.id === targetNodeId)

    // ── 情况判定 ──

    if (heuristicPosition === null) {
        // ── Case A：两节点直连 ──

        if (!sourceInCurrent || !targetInCurrent) {
            issues.push({
                severity: 'error',
                code: 'DIVERGE_NODE_NOT_IN_CURRENT_GRAPH',
                message: `节点不存在于当前图中，请先通过搜索创建启发节点。`,
            })
            return { operations: { current: [], peer: [] }, drafts: [], issues }
        }

        // 链式引用检查
        const sourceNode = currentGraph.nodes.find(node => node.id === sourceNodeId)!
        const targetNode = currentGraph.nodes.find(node => node.id === targetNodeId)!

        if (sourceNode.role === 'reference' && targetNode.role === 'reference') {
            issues.push({
                severity: 'error',
                code: 'DIVERGE_CHAIN_REFERENCE_FORBIDDEN',
                message: `边的两个端点不能同时为引用节点——禁止链式引用。`,
            })
            return { operations: { current: [], peer: [] }, drafts: [], issues }
        }

        const now = new Date().toISOString()
        const edge: EdgeData = {
            id: generateEdgeId(),
            graphId: currentGraph.id,
            source: sourceNodeId,
            target: targetNodeId,
            kind: 'virtual',
            direction: 'directed',
            createdAt: now,
            updatedAt: now,
        }

        return {
            operations: {
                current: [{ type: 'add_edge' as const, edge }],
                peer: [],
            },
            drafts: [],
            issues: [],
        }
    }

    // ── Case B：启发 + 镜像 ──

    // 两个节点不能都在当前图中
    if (sourceInCurrent && targetInCurrent) {
        issues.push({
            severity: 'error',
            code: 'DIVERGE_BOTH_NODES_IN_CURRENT_GRAPH',
            message: `节点 ${sourceNodeId} 和 ${targetNodeId} 都已存在于当前图中，无需创建启发节点。请直接连边。`,
        })
        return { operations: { current: [], peer: [] }, drafts: [], issues }
    }

    // 链式引用检查：在图中那一端的节点必须是 knowledge
    const inGraphNodeId = sourceInCurrent ? sourceNodeId : targetNodeId
    const missingNodeId = sourceInCurrent ? targetNodeId : sourceNodeId
    const inGraphNode = currentGraph.nodes.find(node => node.id === inGraphNodeId)

    if (!inGraphNode) {
        issues.push({
            severity: 'error',
            code: 'DIVERGE_IN_GRAPH_NODE_NOT_FOUND',
            message: `节点 ${inGraphNodeId} 在当前图谱中不存在。`,
        })
        return { operations: { current: [], peer: [] }, drafts: [], issues }
    }

    if (inGraphNode.role !== 'knowledge') {
        issues.push({
            severity: 'error',
            code: 'DIVERGE_CHAIN_REFERENCE_FORBIDDEN',
            message: `边的两个端点不能同时为引用节点——禁止链式引用。`,
        })
        return { operations: { current: [], peer: [] }, drafts: [], issues }
    }

    // 查找哪个已注册图包含 source 或 target 节点
    const peerGraph = findPeerGraph(graphIds, lookupGraph, sourceNodeId, targetNodeId, currentGraph.id)

    if (!peerGraph) {
        issues.push({
            severity: 'error',
            code: 'DIVERGE_PEER_NODE_NOT_FOUND',
            message: `节点 ${missingNodeId} 在所有已注册图谱中均不存在。`,
        })
        return { operations: { current: [], peer: [] }, drafts: [], issues }
    }

    const missingNode = peerGraph.graph.nodes.find(node => node.id === missingNodeId)

    if (!missingNode || missingNode.role !== 'knowledge') {
        issues.push({
            severity: 'error',
            code: 'DIVERGE_PEER_NODE_NOT_KNOWLEDGE',
            message: `目标节点 ${missingNodeId} 不是知识节点，不能创建发散连接。`,
        })
        return { operations: { current: [], peer: [] }, drafts: [], issues }
    }

    const now = new Date().toISOString()

    // ── 当前图：创建启发节点 + 边 ──

    const heuristicId = generateNodeId()
    const heuristicNode = {
        id: heuristicId,
        graphId: currentGraph.id,
        role: 'reference' as const,
        referenceKind: 'heuristic' as const,
        label: missingNode.label,
        sourceGraphId: peerGraph.graph.id,
        sourceNodeId: missingNodeId,
        position: heuristicPosition,
        abstractionLevel: 0,
        degree: 0,
        createdAt: now,
        updatedAt: now,
    }

    // 边方向：保持 source → target
    const currentEdgeSource = sourceInCurrent ? sourceNodeId : heuristicId
    const currentEdgeTarget = sourceInCurrent ? heuristicId : targetNodeId

    const currentEdge: EdgeData = {
        id: generateEdgeId(),
        graphId: currentGraph.id,
        source: currentEdgeSource,
        target: currentEdgeTarget,
        kind: 'virtual',
        direction: 'directed',
        createdAt: now,
        updatedAt: now,
    }

    const currentOps = [
        { type: 'add_node' as const, node: heuristicNode },
        { type: 'add_edge' as const, edge: currentEdge },
    ]

    // ── 镜像：在对端图创建对偶启发节点 + 边 ──

    const mirrorHeuristicId = generateNodeId()

    // scatterInCircle 在对端图中找空位
    const mirrorPosition = findScatterPosition(mirrorHeuristicId, peerGraph.graph)

    if (!mirrorPosition) {
        issues.push({
            severity: 'error',
            code: 'DIVERGE_MIRROR_PLACEMENT_FAILED',
            message: `镜像启发节点在对端图 ${peerGraph.graph.id} 中无法找到空位。`,
        })
        return { operations: { current: [], peer: [] }, drafts: [], issues }
    }

    // 镜像启发节点指向当前图侧已有的知识节点（inGraphNode）
    const mirrorHeuristicNode = {
        id: mirrorHeuristicId,
        graphId: peerGraph.graph.id,
        role: 'reference' as const,
        referenceKind: 'heuristic' as const,
        label: inGraphNode.label,
        sourceGraphId: currentGraph.id,
        sourceNodeId: inGraphNodeId,
        position: mirrorPosition,
        abstractionLevel: 0,
        degree: 0,
        createdAt: now,
        updatedAt: now,
    }

    // 镜像边：保持 source → target 方向
    // sourceInCurrent → source 在 current，所以 mirror 侧 source 是 mirror 启发、target 是 missingNode
    // !sourceInCurrent → source 不在 current，所以 mirror 侧 source 是 missingNode、target 是 mirror 启发
    const mirrorEdgeSource = sourceInCurrent ? mirrorHeuristicId : missingNodeId
    const mirrorEdgeTarget = sourceInCurrent ? missingNodeId : mirrorHeuristicId

    const mirrorEdge: EdgeData = {
        id: generateEdgeId(),
        graphId: peerGraph.graph.id,
        source: mirrorEdgeSource,
        target: mirrorEdgeTarget,
        kind: 'virtual',
        direction: 'directed',
        createdAt: now,
        updatedAt: now,
    }

    const peerOps = [
        { type: 'add_node' as const, node: mirrorHeuristicNode },
        { type: 'add_edge' as const, edge: mirrorEdge },
    ]

    // ── drafts：仅含当前图的启发节点（镜像不可预览） ──

    const drafts: DraftHeuristicPosition[] = [{
        nodeId: heuristicId,
        position: heuristicPosition,
        graphId: currentGraph.id,
    }]

    return { operations: { current: currentOps, peer: peerOps }, drafts, issues }
}

// ═══════════ 内部 ───────────────────────────────

/**
 * 功能：
 *
 *     在已注册图中查找缺失节点所在的图。
 *
 *     遍历 graphIds 中除 currentGraphId 之外的所有图，通过 lookupGraph 获取 GraphData，
 *     返回第一个包含 missingNodeId 的图及其 GraphData。
 */
function findPeerGraph(
    graphIds: GraphId[],
    lookupGraph: GraphLookup,
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    currentGraphId: string,
): { graph: GraphData } | null {
    for (const graphId of graphIds) {
        if (graphId === currentGraphId) continue

        const graph = lookupGraph(graphId)

        if (!graph) continue

        // 查找知识节点（源节点或目标节点在哪个图里）
        if (graph.nodes.some(node => node.id === sourceNodeId || node.id === targetNodeId)) {
            return { graph }
        }
    }

    return null
}

/**
 * 功能：
 *
 *     在对端图中通过 scatterInCircle + hasCollisionAt 找不碰撞空位。
 *
 * 规则：
 *
 *     最多重试 MAX_ATTEMPTS 次。全失败返回 null。
 */
function findScatterPosition(nodeId: NodeId, graph: GraphData): NodePosition | null {
    const center = { x: 0, y: 0 }
    const nodeRadiusOverrides: NodeRadiusMap = new Map()

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const position = scatterInCircle(center, MAX_SCATTER_RADIUS)

        if (!hasCollisionAt(nodeId, position, graph.nodes, nodeRadiusOverrides)) {
            return position
        }
    }

    return null
}
