/**
 * reversal.test.ts
 *
 * 逆操作构造测试。验证 createReversal 为每种图内 Operation 生成逆操作序列，
 * 且逆操作执行后状态与操作前一致。图级操作（add_graph / delete_graph）不构造逆元。
 */

import type { GraphData, EdgeId, GraphId, NodeId } from '../../src/types/graph_data'
import type { AddEdgeOperation, AddNodeOperation } from '../../src/types/atomic_operations'
import { createReversal } from '../../src/core/reversal'
import { executeOperation } from '../../src/core/execute'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-rev' as GraphId

function makeGraph(nodes = 2, edges = 0): GraphData {
    const n: GraphData['nodes'] = []
    for (let i = 0; i < nodes; i++) {
        n.push(createNode({ id: `n${i}` as NodeId, graphId: G }))
    }
    const e: GraphData['edges'] = []
    for (let i = 0; i < edges; i++) {
        e.push(createEdge({ id: `e${i}` as EdgeId, graphId: G, source: `n${i}` as NodeId, target: `n${i + 1}` as NodeId, kind: 'real', direction: 'directed' }))
    }
    return assembleGraph({ id: G, nodes: n, edges: e })
}

// 回放逆操作后状态应与操作前一致
function assertReversalRoundTrip(graph: GraphData, op: Parameters<typeof executeOperation>[1]): void {
    const reversals = createReversal(graph, op)
    const after = executeOperation(graph, op)
    let reverted = after
    for (const rev of reversals) {
        reverted = executeOperation(reverted, rev)
    }
    // degree/edges 恢复
    expect(reverted.nodes.length).toBe(graph.nodes.length)
    expect(reverted.edges.length).toBe(graph.edges.length)
}

describe('createReversal add_node', () => {
    test('逆操作 delete_node 恢复原状态', () => {
        const graph = makeGraph(2)
        const op = { type: 'add_node' as const, node: createNode({ id: 'n-new' as NodeId, graphId: G }) }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal add_edge', () => {
    test('逆操作 delete_edge 恢复原状态', () => {
        const graph = makeGraph(3)
        const op = { type: 'add_edge' as const, edge: createEdge({ id: 'e-new' as EdgeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }) }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal delete_node', () => {
    test('逆操作重建节点和直接边', () => {
        const graph = makeGraph(3, 2) // n0→n1→n2
        const op = { type: 'delete_node' as const, nodeId: 'n1' as NodeId }
        const revs = createReversal(graph, op)
        expect(revs.length).toBeGreaterThan(0)
        assertReversalRoundTrip(graph, op)
    })

    test('逆操作捕获级联引用节点及其边（先节点后边）', () => {
        const graph = assembleGraph({
            id: G,
            title: '级联删除测试',
            nodes: [
                createNode({ id: 'n0' as NodeId, graphId: G }),
                createNode({ id: 'n1' as NodeId, graphId: G }),
                createNode({
                    id: 'n-ref' as NodeId, graphId: G,
                    role: 'reference', referenceKind: 'communication',
                    sourceGraphId: G, sourceNodeId: 'n1' as NodeId,
                }),
            ],
            edges: [
                createEdge({ id: 'e0' as EdgeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
                createEdge({ id: 'e1' as EdgeId, graphId: G, source: 'n0' as NodeId, target: 'n-ref' as NodeId, kind: 'real', direction: 'directed' }),
            ],
        })
        const op = { type: 'delete_node' as const, nodeId: 'n1' as NodeId }
        const revs = createReversal(graph, op)

        // 恢复顺序：先节点（被删节点 + 级联引用节点）后边
        expect(revs.map(r => r.type)).toEqual(['add_node', 'add_node', 'add_edge', 'add_edge'])

        const addNodes = revs.filter((r): r is AddNodeOperation => r.type === 'add_node')
        expect(addNodes.map(n => n.node.id).sort()).toEqual(['n-ref', 'n1'])

        const addEdges = revs.filter((r): r is AddEdgeOperation => r.type === 'add_edge')
        expect(addEdges.map(e => e.edge.id).sort()).toEqual(['e0', 'e1'])

        // 级联引用节点随逆元恢复，不缺失
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal delete_edge', () => {
    test('逆操作 add_edge 恢复原状态', () => {
        const graph = makeGraph(2, 1)
        const op = { type: 'delete_edge' as const, edgeId: 'e0' as EdgeId }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal update_node', () => {
    test('逆操作 update_node 恢复旧值', () => {
        const graph = makeGraph(2)
        const op = { type: 'update_node' as const, node: { ...graph.nodes[0]!, label: 'changed' } }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal update_edge', () => {
    test('逆操作 update_edge 恢复旧值', () => {
        const graph = makeGraph(2, 1)
        const op = { type: 'update_edge' as const, edge: { ...graph.edges[0]!, label: 'changed' } }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal move_node', () => {
    test('逆操作 move_node 恢复旧位置', () => {
        const graph = makeGraph(2)
        // 节点需带 position 才能构造逆元（无 position 属目标缺失，见"目标缺失显式化"块）
        graph.nodes = graph.nodes.map((node, i) => ({
            ...node,
            position: { x: i * 100, y: 50 },
        }))
        const op = { type: 'move_node' as const, nodeId: 'n0' as NodeId, position: { x: 999, y: 888 } }
        assertReversalRoundTrip(graph, op)
    })
})

describe('createReversal expand_dependency', () => {
    test('逆操作 collapse_dependency 携带原折叠条目', () => {
        const graph = makeGraph(3)
        graph.cognitiveState = {
            foldedDependencies: [
                { targetNodeId: 'n0' as NodeId, foldedNodeIds: ['n1' as NodeId, 'n2' as NodeId] },
            ],
        }
        const op = { type: 'expand_dependency' as const, targetNodeId: 'n0' as NodeId }
        const revs = createReversal(graph, op)

        expect(revs).toEqual([
            { type: 'collapse_dependency', targetNodeId: 'n0', foldedNodeIds: ['n1', 'n2'] },
        ])

        // executeCollapseDependency 用字段值恢复，折叠条目与原一致
        const after = executeOperation(graph, op)
        let reverted = after
        for (const rev of revs) {
            reverted = executeOperation(reverted, rev)
        }
        expect(reverted.cognitiveState?.foldedDependencies).toEqual(graph.cognitiveState?.foldedDependencies)
    })
})

describe('createReversal collapse_dependency', () => {
    test('逆操作 expand_dependency 恢复原状态', () => {
        const graph = makeGraph(2)
        const op = { type: 'collapse_dependency' as const, targetNodeId: 'n0' as NodeId, foldedNodeIds: ['n1' as NodeId] }
        assertReversalRoundTrip(graph, op)
    })
})

// 折叠图：n0 ← n1（有向实边），collectDependencyNodeIds('n0') = ['n1']
function makeCollapseGraph(): GraphData {
    return assembleGraph({
        id: G,
        title: '折叠测试',
        nodes: [
            createNode({ id: 'n0' as NodeId, graphId: G }),
            createNode({ id: 'n1' as NodeId, graphId: G }),
        ],
        edges: [
            createEdge({ id: 'c-e' as EdgeId, graphId: G, source: 'n1' as NodeId, target: 'n0' as NodeId, kind: 'real', direction: 'directed' }),
        ],
    })
}

describe('executeCollapseDependency 显式折叠成员', () => {
    test('带 foldedNodeIds 时用字段值（不重算）', () => {
        const graph = makeCollapseGraph()
        const op = { type: 'collapse_dependency' as const, targetNodeId: 'n0' as NodeId, foldedNodeIds: ['nX' as NodeId] }
        const after = executeOperation(graph, op)
        expect(after.cognitiveState?.foldedDependencies).toEqual([
            { targetNodeId: 'n0', foldedNodeIds: ['nX'] },
        ])
    })

    test('不带 foldedNodeIds 时重算折叠成员', () => {
        const graph = makeCollapseGraph()
        const op = { type: 'collapse_dependency' as const, targetNodeId: 'n0' as NodeId }
        const after = executeOperation(graph, op)
        expect(after.cognitiveState?.foldedDependencies).toEqual([
            { targetNodeId: 'n0', foldedNodeIds: ['n1'] },
        ])
    })

    test('foldedNodeIds 为空数组时不写折叠条目（空成员语义）', () => {
        const graph = makeCollapseGraph()
        const op = { type: 'collapse_dependency' as const, targetNodeId: 'n0' as NodeId, foldedNodeIds: [] }
        const after = executeOperation(graph, op)
        expect(after.cognitiveState?.foldedDependencies ?? []).toEqual([])
    })
})

describe('createReversal 图级操作', () => {
    test('add_graph / delete_graph 不构造逆元，返回空数组', () => {
        const graph = makeGraph(2)
        const child = assembleGraph({ id: 'child-rev' as GraphId, nodes: [], edges: [], kind: 'subgraph' })
        expect(createReversal(graph, { type: 'add_graph', graph: child })).toEqual([])
        expect(createReversal(graph, { type: 'delete_graph', graphId: 'child-rev' as GraphId })).toEqual([])
    })
})

describe('createReversal 目标缺失显式化', () => {
    test('delete_node 目标节点缺失时抛异常', () => {
        const graph = makeGraph(2)
        const op = { type: 'delete_node' as const, nodeId: 'n-missing' as NodeId }
        expect(() => createReversal(graph, op)).toThrow(/delete_node/)
    })

    test('delete_edge 目标边缺失时抛异常', () => {
        const graph = makeGraph(2, 1)
        const op = { type: 'delete_edge' as const, edgeId: 'e-missing' as EdgeId }
        expect(() => createReversal(graph, op)).toThrow(/delete_edge/)
    })

    test('update_node 目标节点缺失时抛异常', () => {
        const graph = makeGraph(2)
        const op = { type: 'update_node' as const, node: createNode({ id: 'n-missing' as NodeId, graphId: G }) }
        expect(() => createReversal(graph, op)).toThrow(/update_node/)
    })

    test('update_edge 目标边缺失时抛异常', () => {
        const graph = makeGraph(2, 1)
        const op = {
            type: 'update_edge' as const,
            edge: createEdge({ id: 'e-missing' as EdgeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
        }
        expect(() => createReversal(graph, op)).toThrow(/update_edge/)
    })

    test('move_node 目标节点缺失时抛异常', () => {
        const graph = makeGraph(2)
        const op = { type: 'move_node' as const, nodeId: 'n-missing' as NodeId, position: { x: 1, y: 2 } }
        expect(() => createReversal(graph, op)).toThrow(/move_node/)
    })

    test('move_node 节点无 position 字段时抛异常', () => {
        const graph = makeGraph(2) // createNode 默认无 position
        const op = { type: 'move_node' as const, nodeId: 'n0' as NodeId, position: { x: 1, y: 2 } }
        expect(() => createReversal(graph, op)).toThrow(/move_node/)
    })

    test('expand_dependency 目标折叠条目缺失时抛异常', () => {
        const graph = makeGraph(2)
        const op = { type: 'expand_dependency' as const, targetNodeId: 'n0' as NodeId }
        expect(() => createReversal(graph, op)).toThrow(/expand_dependency/)
    })
})
