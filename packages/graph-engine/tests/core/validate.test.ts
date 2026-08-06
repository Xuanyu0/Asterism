/**
 * validate.test.ts
 *
 * 核心层校验路径测试。覆盖 11 种 Operation 的合法/非法路径。
 */

import { describe, it, expect } from 'vitest'
import type { GraphData, NodeId, GraphId } from '../../src/types/graph_data'
import { validateOperation } from '../../src/core/validate'
import { createNode, createEdge, assembleGraph } from '../test_case_factory'

const G = 'test-v' as GraphId

function makeGraph(nodes = 2, edges = 0): GraphData {
    const n: GraphData['nodes'] = []
    for (let i = 0; i < nodes; i++) {
        n.push(createNode({ id: `n${i}` as NodeId, graphId: G }))
    }
    const e: GraphData['edges'] = []
    for (let i = 0; i < edges; i++) {
        e.push(createEdge({ id: `e${i}` as NodeId, graphId: G, source: `n${i}` as NodeId, target: `n${i + 1}` as NodeId, kind: 'real', direction: 'directed' }))
    }
    return assembleGraph({ id: G, nodes: n, edges: e })
}

// ═══════════ add_node ═══════════

describe('validate add_node', () => {
    it('合法 add_node', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'add_node',
            node: createNode({ id: 'n-new' as NodeId, graphId: G }),
        })
        expect(result.valid).toBe(true)
    })

    it('ID 重复', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'add_node',
            node: createNode({ id: 'n0' as NodeId, graphId: G }),
        })
        expect(result.valid).toBe(false)
        expect(result.issues.some(i => i.code === 'NODE_ID_DUPLICATED')).toBe(true)
    })

    it('label 为空字符串 → EMPTY_LABEL', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'add_node',
            node: createNode({ id: 'n-empty' as NodeId, graphId: G, label: '' }),
        })
        expect(result.valid).toBe(false)
        const issue = result.issues.find(i => i.code === 'EMPTY_LABEL')
        expect(issue).toBeDefined()
        expect(issue!.message).toBe('节点标签不能为空。')
        expect(issue!.targetType).toBe('node')
        expect(issue!.targetId).toBe('n-empty')
    })

    it('label 为纯空白 → EMPTY_LABEL（trim 语义）', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'add_node',
            node: createNode({ id: 'n-blank' as NodeId, graphId: G, label: '   ' }),
        })
        expect(result.valid).toBe(false)
        expect(result.issues.some(i => i.code === 'EMPTY_LABEL')).toBe(true)
    })

    it('正常 label → 无 EMPTY_LABEL', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'add_node',
            node: createNode({ id: 'n-ok' as NodeId, graphId: G, label: '知识节点' }),
        })
        expect(result.valid).toBe(true)
        expect(result.issues.some(i => i.code === 'EMPTY_LABEL')).toBe(false)
    })
})

// ═══════════ add_edge ═══════════

describe('validate add_edge', () => {
    it('合法 add_edge（有向实边）', () => {
        const graph = makeGraph(3)
        const result = validateOperation(graph, {
            type: 'add_edge',
            edge: createEdge({ id: 'e-new' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
        })
        expect(result.valid).toBe(true)
    })

    it('端点不存在', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'add_edge',
            edge: createEdge({ id: 'e-new' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n-x' as NodeId, kind: 'real', direction: 'undirected' }),
        })
        expect(result.valid).toBe(false)
    })

    it('自环由 applyBatch 全局规则检出（validateOperation 只校验前提）', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'add_edge',
            edge: createEdge({ id: 'e-self' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n0' as NodeId, kind: 'real', direction: 'directed' }),
        })
        // validateOperation 不再检查自环——全局规则在 applyBatch Phase 3 统一执行
        expect(result.valid).toBe(true)
    })

    it('重边由 applyBatch 全局规则检出（validateOperation 只校验前提）', () => {
        const graph = makeGraph(3, 1) // e0 已连接 n0→n1
        const result = validateOperation(graph, {
            type: 'add_edge',
            edge: createEdge({ id: 'e-dup' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
        })
        // validateOperation 不再检查重边——全局规则在 applyBatch Phase 3 统一执行
        expect(result.valid).toBe(true)
    })
})

// ═══════════ delete_node ═══════════

describe('validate delete_node', () => {
    it('合法 delete_node', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, { type: 'delete_node', nodeId: 'n0' as NodeId })
        expect(result.valid).toBe(true)
    })

    it('节点不存在', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, { type: 'delete_node', nodeId: 'n-x' as NodeId })
        expect(result.valid).toBe(false)
        expect(result.issues.some(i => i.code === 'NODE_NOT_FOUND')).toBe(true)
    })
})

// ═══════════ delete_edge ═══════════

describe('validate delete_edge', () => {
    it('合法 delete_edge', () => {
        const graph = makeGraph(2, 1)
        const result = validateOperation(graph, { type: 'delete_edge', edgeId: 'e0' as NodeId })
        expect(result.valid).toBe(true)
    })

    it('边不存在', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, { type: 'delete_edge', edgeId: 'e-x' as NodeId })
        expect(result.valid).toBe(false)
    })
})

// ═══════════ update_node ═══════════

describe('validate update_node', () => {
    it('合法 update_node', () => {
        // makeGraph uses assembleGraph which runs normalize+validate.
        // Construct a minimal valid node manually to avoid validateGraph overhead.
        const g: GraphData = { id: G, kind: 'root', title: 't', nodes: [], edges: [] }
        const n0 = createNode({ id: 'n0' as NodeId, graphId: G, label: 'src' })
        const graph = { ...g, nodes: [n0] }
        const result = validateOperation(graph, {
            type: 'update_node',
            node: { ...n0, label: 'updated' },
        })
        expect(result.valid).toBe(true)
    })

    it('节点不存在', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'update_node',
            node: createNode({ id: 'n-x' as NodeId, graphId: G }),
        })
        expect(result.valid).toBe(false)
    })
})

// ═══════════ update_edge ═══════════

describe('validate update_edge', () => {
    it('合法 update_edge', () => {
        const graph = makeGraph(2, 1)
        const result = validateOperation(graph, {
            type: 'update_edge',
            edge: { ...graph.edges[0]!, label: 'new-label' },
        })
        expect(result.valid).toBe(true)
    })

    it('边不存在', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, {
            type: 'update_edge',
            edge: createEdge({ id: 'e-x' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'undirected' }),
        })
        expect(result.valid).toBe(false)
    })
})

// ═══════════ move_node ═══════════

describe('validate move_node', () => {
    it('合法 move_node', () => {
        const graph = makeGraph(2)
        const result = validateOperation(graph, { type: 'move_node', nodeId: 'n0' as NodeId, position: { x: 100, y: 200 } })
        expect(result.valid).toBe(true)
    })
})

// ═══════════ collapse_dependency / expand_dependency ═══════════

describe('validate collapse/expand', () => {
    it('合法 collapse_dependency', () => {
        const graph = makeGraph(3, 2) // e0: n0→n1, e1: n1→n2
        const result = validateOperation(graph, { type: 'collapse_dependency', targetNodeId: 'n2' as NodeId })
        expect(result.valid).toBe(true)
    })

    it('合法 expand_dependency', () => {
        const graph = makeGraph(3, 2)
        const result = validateOperation(graph, { type: 'expand_dependency', targetNodeId: 'n0' as NodeId })
        expect(result.valid).toBe(true)
    })
})
