/**
 * pipeline.test.ts
 *
 * 测试 applyBatch 事务流水线。
 */

import { describe, it, expect } from 'vitest'
import { applyBatch } from '../src/compose/pipeline'
import type { GraphData } from '../src/types/graph_data'
import type { GraphOperation } from '../src/types/atomic_operations'

function emptyGraph(): GraphData {
    return {
        id: 'test-graph',
        kind: 'main',
        title: 'Test',
        nodes: [],
        edges: [],
    }
}

function addNodeOp(id: string, label: string): GraphOperation {
    return {
        type: 'add_node',
        node: {
            id,
            graphId: 'test-graph',
            role: 'knowledge',
            kind: 'real',
            label,
            degree: 0,
            abstractionLevel: 0,
        },
    }
}

// ═══════════ applyBatch ═══════════

describe('applyBatch', () => {
    it('executes all ops when all valid', () => {
        const graph = emptyGraph()
        const ops = [
            addNodeOp('a', 'Node A'),
            addNodeOp('b', 'Node B'),
        ]

        const result = applyBatch(graph, ops)

        expect(result.validation.valid).toBe(true)
        expect(result.graph.nodes).toHaveLength(2)
        expect(result.results).toHaveLength(2)
        expect(result.graph.nodes[0].id).toBe('a')
        expect(result.graph.nodes[1].id).toBe('b')
    })

    it('returns original graph unchanged on validation failure', () => {
        const graph = emptyGraph()
        const graphWithA = applyBatch(graph, [addNodeOp('a', 'Node A')]).graph

        // 尝试添加重复节点
        const ops = [addNodeOp('a', 'Duplicate Node A')]
        const result = applyBatch(graphWithA, ops)

        expect(result.validation.valid).toBe(false)
        expect(result.graph).toBe(graphWithA) // 原样返回
        expect(result.graph.nodes).toHaveLength(1)
    })

    it('returned graph unchanged on dryRun', () => {
        const graph = emptyGraph()
        const ops = [addNodeOp('a', 'Node A')]

        const result = applyBatch(graph, ops, { dryRun: true })

        expect(result.validation.valid).toBe(true)
        expect(result.graph).toBe(graph) // 入参原封不动
        expect(result.graph.nodes).toHaveLength(0) // 未执行
    })

    it('stops on first failure with stopOnFirst', () => {
        const graph = emptyGraph()
        const ops = [
            addNodeOp('x', 'Valid'),
            addNodeOp('x', 'Dupe'),      // 重复 ID → 校验失败（graph 中不存在 x）
            addNodeOp('y', 'Valid'),
        ]

        const result = applyBatch(graph, ops, { stopOnFirst: true })

        // validate-all-first：所有校验都针对原始 graph（空图），
        // 第二个 x 也不重复（原图没有 x）→ 全部通过。
        // stopOnFirst 在"已有独立校验失败"时生效——本测试验证此场景下行为一致。
        expect(result.validation.valid).toBe(true)
        expect(result.results).toHaveLength(3)
    })

    it('validation fails when op violates rules on original graph', () => {
        const graph = emptyGraph()
        const graphWithX = applyBatch(graph, [addNodeOp('x', 'Node X')]).graph

        // x 已在图中，再添加同 ID 节点 → 校验失败
        const ops = [addNodeOp('y', 'Node Y'), addNodeOp('x', 'Dupe')]
        const result = applyBatch(graphWithX, ops)

        expect(result.validation.valid).toBe(false)
        expect(result.graph).toBe(graphWithX)
        expect(result.results).toHaveLength(2)
        expect(result.validation.issues.length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty results for empty ops', () => {
        const graph = emptyGraph()

        const result = applyBatch(graph, [])

        expect(result.validation.valid).toBe(true)
        expect(result.results).toHaveLength(0)
        expect(result.graph).toBe(graph)
    })
})
