/**
 * 说明：
 *
 *     预览层模拟管道。回答"如果加了这条边，图会变成什么样，会不会碰撞？"，
 *     不实际修改真实图。
 *
 * 角色：
 *
 *     预览层是 GraphData 的只读模拟投影——clone 当前图 → applyBatch 模拟执行 →
 *     返回预览图 + 碰撞布尔。add_edge 工具的 hover 预览拿到预览图后
 *     交给渲染层 syncFromGraphData 整图渲染。
 *
 * 未来扩展：
 *
 *     通用 simulateCollision(graph, registry, operation) 管道供 move / orbit 预览使用。
 *     当前按 YAGNI 仅实现 add-edge。
 */

import { applyBatch, generateEdgeId, hasCollisionAt } from '@my-project/graph-engine'

import type { AddEdgeOperation, GraphData, NodeId } from '@my-project/graph-engine'


/**
 * 说明：
 *
 *     模拟在 sourceId → targetId 间添加一条边，返回预览图与两端点碰撞判定。
 *     预览图的 source/target degree 已 +1，
 *     碰撞判定在加边后的图上进行。
 *
 * 参数：
 *
 *     graph — 操作前的 GraphData 快照。入参不被修改（JSON 序列化克隆隔离）
 *     edge  — 待添加边的描述。sourceId / targetId 为两端节点 ID，
 *             kind 为 'real' 实边 / 'virtual' 虚边，
 *             direction 为 'directed' 有向 / 'undirected' 无向
 *
 * 返回值：
 *
 *     previewGraph    — 模拟加边后的预览图；valid 为 false 时等于 clone（未执行）
 *     valid           — applyBatch 校验结果；false 时碰撞布尔一律为 false
 *     sourceCollides  — source 加边后（半径增大）是否与任一节点碰撞，含 target
 *     targetCollides  — target 加边后（半径增大）是否与任一节点碰撞，含 source
 *
 * 调用契约：
 *
 *     valid 为 true 时调用方应渲染 previewGraph；false 时保持现状。
 */
export function previewAddEdge(
    graph: GraphData,
    edge: {
        sourceId: NodeId
        targetId: NodeId
        kind: 'real' | 'virtual'
        direction: 'directed' | 'undirected'
    },
): {
    previewGraph: GraphData
    valid: boolean
    sourceCollides: boolean
    targetCollides: boolean
} {
    // 用 JSON 序列化克隆而非 structuredClone：graphStore.graphView 是 Vue 响应式
    // Proxy，structuredClone 无法克隆 Proxy（抛 DataCloneError）。
    // 与 graph_store.ts undo snapshot 的克隆方式保持一致。
    const clone: GraphData = JSON.parse(JSON.stringify(graph))

    const addEdgeOp: AddEdgeOperation = {
        type: 'add_edge',
        edge: {
            id: generateEdgeId(),
            graphId: clone.id,
            source: edge.sourceId,
            target: edge.targetId,
            kind: edge.kind,
            direction: edge.direction,
            label: '',
        },
    }

    const result = applyBatch(clone, [addEdgeOp])

    if (result.validation.valid === false) {
        return { previewGraph: clone, valid: false, sourceCollides: false, targetCollides: false }
    }

    const previewGraph = result.graph
    const source = previewGraph.nodes.find(node => node.id === edge.sourceId)
    const target = previewGraph.nodes.find(node => node.id === edge.targetId)

    const sourceCollides = source?.position
        ? hasCollisionAt(edge.sourceId, source.position, previewGraph.nodes, new Map())
        : false

    const targetCollides = target?.position
        ? hasCollisionAt(edge.targetId, target.position, previewGraph.nodes, new Map())
        : false

    return { previewGraph, valid: true, sourceCollides, targetCollides }
}
