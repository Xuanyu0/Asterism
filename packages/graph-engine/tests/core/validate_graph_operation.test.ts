/**
 * validate_graph_operation.test.ts
 *
 * 测试 validateGraphOperation（图级操作局部规则校验：add_graph 空图 / delete_graph 目标空图）。
 */

import { validateGraphOperation } from '../../src/core/rules/preconditions/graph_level'
import type { GraphData, GraphId, GraphRegistry, NodeId } from '../../src/types/graph_data'
import type { AtomicGraphOperation } from '../../src/types/atomic_operations'
import { createNode, assembleGraph } from '../test_case_factory'

const G = 'parent' as GraphId
const CHILD = 'child' as GraphId

function makeNonEmptyGraph(): GraphData {
    return assembleGraph({
        id: G,
        nodes: [createNode({ id: 'n0' as NodeId, graphId: G }), createNode({ id: 'n1' as NodeId, graphId: G })],
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

function makeUpdateGraphOp(graph: GraphData): AtomicGraphOperation {
    return { type: 'update_graph', graph }
}

/** 构造空 root 图（title 可指定），供 add_graph / update_graph 校验用。 */
function makeRootGraph(id: GraphId, title: string): GraphData {
    return assembleGraph({
        id,
        kind: 'root',
        title,
        nodes: [],
        edges: [],
    })
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

// ═══════════ title 业务校验（EMPTY_TITLE / TITLE_DUPLICATE） ═══════════

describe('validateGraphOperation title 校验（add_graph / update_graph）', () => {
    test('add_graph 空名（trim 后）：EMPTY_TITLE', () => {
        const registry = makeRegistry()
        const result = validateGraphOperation(registry, makeAddGraphOp(makeRootGraph('root-a' as GraphId, '   ')))

        expect(result.valid).toBe(false)
        expect(result.issues[0]?.code).toBe('EMPTY_TITLE')
    })

    test('add_graph root 与其他 root 同名：TITLE_DUPLICATE', () => {
        const registry = makeRegistry(makeRootGraph('root-a' as GraphId, '同题'))
        const result = validateGraphOperation(registry, makeAddGraphOp(makeRootGraph('root-b' as GraphId, '同题')))

        expect(result.valid).toBe(false)
        expect(result.issues[0]?.code).toBe('TITLE_DUPLICATE')
    })

    test('add_graph root 与子图同名：不拦截（子图不做唯一性校验）', () => {
        const registry = makeRegistry(makeRootGraph('root-a' as GraphId, '同题'))
        const sub = { ...makeEmptyChildGraph(), title: '同题' } // 子图与 root 同名
        const result = validateGraphOperation(registry, makeAddGraphOp(sub))

        expect(result.valid).toBe(true)
    })

    test('update_graph 空名（trim 后）：EMPTY_TITLE', () => {
        const root = makeRootGraph('root-a' as GraphId, '旧题')
        const registry = makeRegistry(root)
        const result = validateGraphOperation(registry, makeUpdateGraphOp({ ...root, title: '   ' }))

        expect(result.valid).toBe(false)
        expect(result.issues[0]?.code).toBe('EMPTY_TITLE')
    })

    test('update_graph root 与其他 root 同名：TITLE_DUPLICATE', () => {
        const rootA = makeRootGraph('root-a' as GraphId, '同题')
        const rootB = makeRootGraph('root-b' as GraphId, '旧题')
        const registry = makeRegistry(rootA, rootB)
        const result = validateGraphOperation(registry, makeUpdateGraphOp({ ...rootB, title: '同题' }))

        expect(result.valid).toBe(false)
        expect(result.issues[0]?.code).toBe('TITLE_DUPLICATE')
    })

    test('update_graph title 带首尾空白：trim 后与 root 同名仍拦截', () => {
        const rootA = makeRootGraph('root-a' as GraphId, '同题')
        const rootB = makeRootGraph('root-b' as GraphId, '旧题')
        const registry = makeRegistry(rootA, rootB)
        const result = validateGraphOperation(registry, makeUpdateGraphOp({ ...rootB, title: '  同题  ' }))

        expect(result.valid).toBe(false)
        expect(result.issues[0]?.code).toBe('TITLE_DUPLICATE')
    })

    test('update_graph 改回自身当前 title：不报重名（排除自身 id）', () => {
        const rootA = makeRootGraph('root-a' as GraphId, '同题')
        const registry = makeRegistry(rootA)
        const result = validateGraphOperation(registry, makeUpdateGraphOp({ ...rootA, title: '同题' }))

        expect(result.valid).toBe(true)
    })

    test('update_graph 子图改为与 root 同名：不拦截（子图不做唯一性校验）', () => {
        const rootA = makeRootGraph('root-a' as GraphId, '同题')
        const sub = makeEmptyChildGraph()
        const registry = makeRegistry(rootA, sub)
        const result = validateGraphOperation(registry, makeUpdateGraphOp({ ...sub, title: '同题' }))

        expect(result.valid).toBe(true)
    })
})
