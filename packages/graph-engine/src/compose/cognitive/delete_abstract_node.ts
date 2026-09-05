/**
 * 抽象节点递归删除编排：删除目标抽象节点及其整棵子图树（嵌套抽象节点不留死图）。
 *
 * @remarks
 * 与其他 compose 函数同构——纯函数、不持有状态、只产批次不执行，
 * 调用方拿 `{ batches, issues }` 直接交给 applyBatches 执行。
 *
 * 边界（不防御）：childGraphId 链成环属数据损坏，本函数不设环检测——
 * 递归遇环会栈溢出（崩溃可见而非静默）；前端渲染期 deriveAbstractionLevel 对同场景先抛错拦截。
 */

import type {
    GraphData,
    GraphRegistry,
    KnowledgeNodeData,
    NodeData,
    NodeId,
} from '../../types/graph_data'

import type { AtomicOperationInGraph } from '../../types/atomic_operations'

import type { ComposeIssue, OperationBatch } from '../../types/compose_types'

import { deriveNodeForm } from '../../core/derive'

// ═══════════ 参数类型 ═══════════

/**
 * 删除抽象节点操作的输入参数。
 *
 * @remarks
 * registry 直接用多图注册表（新接口）；现有 compose 函数的 GraphLookup 参数暂不统一。
 */
export interface DeleteAbstractNodeParams {
    /** 待删除的抽象节点 ID。 */
    nodeId: NodeId

    /** 多图注册表（GraphId → GraphData）。 */
    registry: GraphRegistry
}

// ═══════════ deleteAbstractNode ═══════════

/**
 * 删除抽象节点及其整棵子图树，产出递归清空/注销的批序列。
 *
 * @remarks
 * 递归后序 DFS（自底向上）：
 * 1. 子图内抽象节点先递归（子树清空注销后，本图才能整图注销）
 * 2. for 退出后构造本图清空批（delete_node 全部节点，抽象 + 原子 + 引用混批）
 * 3. 图级注销批（delete_graph 空图骨架）紧随清空批
 *
 * 职责归属：每个节点恰好被其所在图的清空批删除一次——递归只处理子树，
 * delete_node 全部收在"所在图清空批"，顶层目标节点归其所在图的最后一批。
 * 边 / 引用节点 / 折叠状态由 executeDeleteNode 级联清理，本函数不构造 delete_edge。
 * 共享子图（两个抽象节点指向同一子图的畸形数据）不做防御。
 *
 * @param params - 目标节点 ID 与多图注册表
 * @returns 批序列 + 问题列表；预检失败（节点不存在 / 非抽象）时 batches 为空
 */
export function deleteAbstractNode(params: DeleteAbstractNodeParams): {
    batches: OperationBatch[]
    issues: ComposeIssue[]
} {
    const { nodeId, registry } = params
    const issues: ComposeIssue[] = []

    // ── 预检：定位目标节点及其所在图 ──

    let targetGraph: GraphData | undefined
    let targetNode: NodeData | undefined
    for (const graph of registry.values()) {
        const node = graph.nodes.find((n) => n.id === nodeId)
        if (node) {
            targetGraph = graph
            targetNode = node
            break
        }
    }

    if (!targetNode || !targetGraph) {
        issues.push({
            severity: 'error',
            code: 'DELETE_ABSTRACT_TARGET_NOT_FOUND',
            message: `节点 ${nodeId} 不在注册表任何图中。`,
        })
        return { batches: [], issues }
    }

    if (
        targetNode.role !== 'knowledge' ||
        deriveNodeForm(targetNode) !== 'abstract'
    ) {
        issues.push({
            severity: 'error',
            code: 'DELETE_ABSTRACT_TARGET_NOT_ABSTRACT',
            message: `节点 ${nodeId} 不是抽象节点，不做递归删除。`,
        })
        return { batches: [], issues }
    }

    // ── 递归后序清空子树 ──

    const batches: OperationBatch[] = []
    collectAbstractSubtree(targetNode, registry, batches)

    // 顶层：目标节点归其所在图的清空批（后序 DFS 的最后一批）
    batches.push({
        kind: 'inGraph',
        graph: targetGraph,
        operations: [{ type: 'delete_node', nodeId }],
    })

    return { batches, issues }
}

// ═══════════ 内部 ═══════════

/** 后序 DFS 清空并注销 node 的子图树，批序累积进 batches。 */
function collectAbstractSubtree(
    node: KnowledgeNodeData,
    registry: GraphRegistry,
    batches: OperationBatch[],
): void {
    const subGraph = node.childGraphId
        ? registry.get(node.childGraphId)
        : undefined
    // 原子节点路径 / 链中断：无子图可清空，直接返回
    if (!subGraph) return

    // 子树优先：子图内抽象节点先递归，本图清空批在其全部子树注销后构造
    for (const subNode of subGraph.nodes) {
        if (subNode.role !== 'knowledge') continue
        if (deriveNodeForm(subNode) !== 'abstract') continue
        collectAbstractSubtree(subNode, registry, batches)
    }

    // 清空批：同图全部节点同批删除（抽象 + 原子 + 引用混批）
    if (subGraph.nodes.length > 0) {
        const deleteOps: AtomicOperationInGraph[] = subGraph.nodes.map((n) => ({
            type: 'delete_node',
            nodeId: n.id,
        }))
        batches.push({
            kind: 'inGraph',
            graph: subGraph,
            operations: deleteOps,
        })
    }

    // 注销批：清空批之后（delete_graph 只接受空图）
    batches.push({
        kind: 'graphLevel',
        operations: [
            { type: 'delete_graph', graph: buildEmptyGraphSkeleton(subGraph) },
        ],
    })
}

/**
 * 构造 delete_graph 携带的空图骨架：仅元数据字段，nodes / edges 置空。
 *
 * @remarks
 * 骨架是图级操作的逆元载体——undo 时经 add_graph 原样恢复注册，
 * 内容由重放批重建。cognitiveState 取空折叠列表（级联删除后亦为空）。
 */
function buildEmptyGraphSkeleton(graph: GraphData): GraphData {
    return {
        id: graph.id,
        kind: graph.kind,
        title: graph.title,
        parentGraphId: graph.parentGraphId,
        ownerNodeId: graph.ownerNodeId,
        createdAt: graph.createdAt,
        updatedAt: graph.updatedAt,
        nodes: [],
        edges: [],
        cognitiveState: { foldedDependencies: [] },
    }
}
