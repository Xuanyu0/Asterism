/**
 * 时间戳参数化测试。
 *
 * @remarks
 * 验证 executeOperation 使用调用方传入的 executedAt（对象级 = 操作携带值 ?? executedAt，
 * 无模式分支），以及 executedAt 可传历史时刻。
 */

import type { GraphData, GraphId, NodeId } from '../../src/types/graph_data'
import { executeOperation } from '../../src/core/execute_operation'
import { createReversal } from '../../src/core/reversal'
import { createNode, assembleGraph } from '../test_case_factory'

const G = 'test-ts' as GraphId
const EXECUTED_AT = '2026-01-01T00:00:00.000Z'
const HISTORICAL_AT = '2015-05-05T10:30:00.000Z'
const OLD_CREATED = '2020-01-01T00:00:00.000Z'
const OLD_UPDATED = '2021-06-15T12:00:00.000Z'

/** 单节点图，节点携带历史时间戳。 */
function makeTimestampedGraph(): GraphData {
    const node = {
        ...createNode({ id: 'n0' as NodeId, graphId: G, label: 'old' }),
        createdAt: OLD_CREATED,
        updatedAt: OLD_UPDATED,
    }
    return assembleGraph({ id: G, nodes: [node], edges: [] })
}

function nodeById(graph: GraphData, id: NodeId) {
    return graph.nodes.find((node) => node.id === id)!
}

describe('正向操作：对象级时间戳 = 传入 executedAt', () => {
    test('add_node：对象级 createdAt / updatedAt 与图级 updatedAt = executedAt', () => {
        const graph = assembleGraph({ id: G, nodes: [], edges: [] })
        const next = executeOperation(
            graph,
            {
                type: 'add_node',
                node: createNode({ id: 'n-new' as NodeId, graphId: G }),
            },
            EXECUTED_AT,
        )

        const added = nodeById(next, 'n-new' as NodeId)
        expect(added.createdAt).toBe(EXECUTED_AT)
        expect(added.updatedAt).toBe(EXECUTED_AT)
        expect(next.updatedAt).toBe(EXECUTED_AT)
    })

    test('update_node：对象级 updatedAt 与图级 updatedAt = executedAt（构造不携带时间戳）', () => {
        const graph = assembleGraph({
            id: G,
            nodes: [createNode({ id: 'n0' as NodeId, graphId: G })],
            edges: [],
        })
        const next = executeOperation(
            graph,
            {
                type: 'update_node',
                node: { ...graph.nodes[0]!, label: 'changed' },
            },
            EXECUTED_AT,
        )

        expect(nodeById(next, 'n0' as NodeId).updatedAt).toBe(EXECUTED_AT)
        expect(next.updatedAt).toBe(EXECUTED_AT)
    })

    test('executedAt 可传历史时刻：时间戳 = 该时刻（redo 场景 GE 支撑）', () => {
        const graph = assembleGraph({ id: G, nodes: [], edges: [] })
        const next = executeOperation(
            graph,
            {
                type: 'add_node',
                node: createNode({ id: 'n-hist' as NodeId, graphId: G }),
            },
            HISTORICAL_AT,
        )

        const added = nodeById(next, 'n-hist' as NodeId)
        expect(added.createdAt).toBe(HISTORICAL_AT)
        expect(added.updatedAt).toBe(HISTORICAL_AT)
        expect(next.updatedAt).toBe(HISTORICAL_AT)
    })
})

describe('逆元默认恢复历史时间戳（无模式标记）', () => {
    test('update_node 逆元：updatedAt 恢复为历史值', () => {
        const graph = makeTimestampedGraph()
        // 正向构造不携带时间戳（剔除 updatedAt，模拟 default_tool 构造约定）
        const { updatedAt: _updatedAt, ...nodeData } = graph.nodes[0]!
        const forwardOp = {
            type: 'update_node' as const,
            node: { ...nodeData, label: 'changed' },
        }
        const reversals = createReversal(graph, forwardOp)
        const after = executeOperation(graph, forwardOp, EXECUTED_AT)

        // 正向：构造不携带 → executedAt
        expect(nodeById(after, 'n0' as NodeId).updatedAt).toBe(EXECUTED_AT)

        let reverted = after
        for (const rev of reversals) {
            reverted = executeOperation(reverted, rev, EXECUTED_AT)
        }

        // 逆元：快照携带 OLD_UPDATED → 默认恢复历史值
        expect(nodeById(reverted, 'n0' as NodeId).label).toBe('old')
        expect(nodeById(reverted, 'n0' as NodeId).updatedAt).toBe(OLD_UPDATED)
        // 图级 updatedAt 恒 = 传入 executedAt
        expect(reverted.updatedAt).toBe(EXECUTED_AT)
    })

    test('delete_node 逆元（add_node 快照）：createdAt / updatedAt 恢复为历史值', () => {
        const graph = makeTimestampedGraph()
        const forwardOp = {
            type: 'delete_node' as const,
            nodeId: 'n0' as NodeId,
        }
        const reversals = createReversal(graph, forwardOp)
        const after = executeOperation(graph, forwardOp, EXECUTED_AT)
        expect(after.nodes.length).toBe(0)

        let reverted = after
        for (const rev of reversals) {
            reverted = executeOperation(reverted, rev, EXECUTED_AT)
        }

        const restored = nodeById(reverted, 'n0' as NodeId)
        expect(restored.createdAt).toBe(OLD_CREATED)
        expect(restored.updatedAt).toBe(OLD_UPDATED)
        expect(reverted.updatedAt).toBe(EXECUTED_AT)
    })
})
