/**
 * validate_graph_operation.test.ts
 *
 * 测试 validateGraphOperation（图级操作局部规则校验：add_graph 空图 / delete_graph 目标空图）。
 */

import { validateGraphOperation } from '../../src/core/validate_graph_operation'
import type {
    GraphData,
    GraphId,
    GraphRegistry,
    NodeId,
} from '../../src/types/graph_data'
import type { AtomicGraphOperation } from '../../src/types/atomic_operations'
import { createNode, assembleGraph } from '../test_case_factory'

const G = 'parent' as GraphId
const CHILD = 'child' as GraphId

function makeNonEmptyGraph(): GraphData {
    return assembleGraph({
        id: G,
        nodes: [
            createNode({ id: 'n0' as NodeId, graphId: G }),
            createNode({ id: 'n1' as NodeId, graphId: G }),
        ],
        edges: [],
    })
}

function makeEmptyChildGraph(): GraphData {
    return assembleGraph({
        id: CHILD,
        kind: 'subgraph',
        nodes: [],
        edges: [],
    })
}

function makeRegistry(...graphs: GraphData[]): GraphRegistry {
    return new Map(graphs.map((g) => [g.id, g]))
}

function makeAddGraphOp(graph: GraphData): AtomicGraphOperation {
    return { type: 'add_graph', graph }
}

function makeDeleteGraphOp(graph: GraphData): AtomicGraphOperation {
    return { type: 'delete_graph', graph }
}

// ═══════════ add_graph：只构造空图 ═══════════

describe('validateGraphOperation add_graph 局部规则（只能构造空图）', () => {
    test('add_graph 空图通过', () => {
        const registry = makeRegistry()
        const result = validateGraphOperation(registry, makeAddGraphOp(makeEmptyChildGraph()))

        expect(result.valid).toBe(true)
    })

    test('add_graph 非空 nodes 校验失败', () => {
        const registry = makeRegistry()
        const result = validateGraphOperation(registry, makeAddGraphOp(makeNonEmptyGraph()))

        expect(result.valid).toBe(false)
        expect(result.issues[0]?.code).toBe('ADD_GRAPH_NOT_EMPTY')
    })
})

// ═══════════ delete_graph：只能删除空图 ═══════════

describe('validateGraphOperation delete_graph 局部规则（只能删除空图）', () => {
    test('delete_graph 目标为空图通过', () => {
        const child = makeEmptyChildGraph()
        const registry = makeRegistry(child)
        const result = validateGraphOperation(registry, makeDeleteGraphOp(child))

        expect(result.valid).toBe(true)
    })

    test('delete_graph 目标为非空图校验失败', () => {
        const parent = makeNonEmptyGraph()
        const registry = makeRegistry(parent)
        const result = validateGraphOperation(registry, makeDeleteGraphOp(parent))

        expect(result.valid).toBe(false)
        expect(result.issues[0]?.code).toBe('DELETE_GRAPH_NOT_EMPTY')
    })

    test('delete_graph 目标不存在：静默通过（幂等注销）', () => {
        const registry = makeRegistry()
        const result = validateGraphOperation(registry, makeDeleteGraphOp(makeEmptyChildGraph()))

        expect(result.valid).toBe(true)
    })
})
