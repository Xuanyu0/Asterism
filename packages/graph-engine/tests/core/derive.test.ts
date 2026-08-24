/**
 * derive.test.ts
 *
 * 测试 deriveNodeForm / deriveAbstractionLevel。
 */

import type {
    GraphData,
    GraphId,
    KnowledgeNodeData,
    NodeData,
    ReferenceNodeData,
} from '../../src/types/graph_data'
import { deriveNodeForm, deriveAbstractionLevel } from '../../src/core/derive'

// ═══════════ 辅助 ═══════════

function makeKnowledgeNode(childGraphId?: GraphId): KnowledgeNodeData {
    return {
        id: 'n',
        graphId: 'g',
        role: 'knowledge',
        kind: 'real',
        label: 'n',
        degree: 0,
        childGraphId,
    }
}

function makeReferenceNode(childGraphId?: GraphId): ReferenceNodeData {
    return {
        id: 'r',
        graphId: 'g',
        role: 'reference',
        referenceKind: 'communication',
        sourceGraphId: 'src',
        sourceNodeId: 'src-node',
        label: 'r',
        degree: 0,
        childGraphId,
    }
}

function makeGraph(id: GraphId, nodes: NodeData[]): GraphData {
    return {
        id,
        kind: 'subgraph',
        title: id,
        nodes,
        edges: [],
        cognitiveState: { foldedDependencies: [] },
    }
}

function makeLookup(
    graphs: GraphData[],
): (graphId: GraphId) => GraphData | undefined {
    const map = new Map<GraphId, GraphData>()
    for (const g of graphs) map.set(g.id, g)
    return (graphId) => map.get(graphId)
}

// ═══════════ deriveNodeForm ═══════════

describe('deriveNodeForm', () => {
    test('无 childGraphId → atomic', () => {
        expect(deriveNodeForm(makeKnowledgeNode())).toBe('atomic')
    })

    test('有 childGraphId → abstract', () => {
        expect(deriveNodeForm(makeKnowledgeNode('sub-a' as GraphId))).toBe(
            'abstract',
        )
    })
})

// ═══════════ deriveAbstractionLevel ═══════════

describe('deriveAbstractionLevel', () => {
    test('原子节点（无 childGraphId）→ 0', () => {
        const lookup = makeLookup([])
        expect(deriveAbstractionLevel(lookup, makeKnowledgeNode())).toBe(0)
    })

    test('抽象节点空子图 → 1', () => {
        const child = makeGraph('sub-a' as GraphId, [])
        const lookup = makeLookup([child])
        expect(
            deriveAbstractionLevel(
                lookup,
                makeKnowledgeNode('sub-a' as GraphId),
            ),
        ).toBe(1)
    })

    test('深层链多级嵌套 → 递增', () => {
        // sub-c（含原子节点）⊂ sub-b ⊂ sub-a：入口 → sub-a → sub-b → sub-c → 原子
        const graphC = makeGraph('sub-c' as GraphId, [makeKnowledgeNode()])
        const graphB = makeGraph('sub-b' as GraphId, [
            makeKnowledgeNode('sub-c' as GraphId),
        ])
        const graphA = makeGraph('sub-a' as GraphId, [
            makeKnowledgeNode('sub-b' as GraphId),
        ])
        const lookup = makeLookup([graphC, graphB, graphA])

        expect(
            deriveAbstractionLevel(
                lookup,
                makeKnowledgeNode('sub-a' as GraphId),
            ),
        ).toBe(3)
    })

    test('子图不可达（lookupGraph 返回 undefined）→ 防御 1', () => {
        const lookup = makeLookup([])
        expect(
            deriveAbstractionLevel(
                lookup,
                makeKnowledgeNode('missing' as GraphId),
            ),
        ).toBe(1)
    })

    test('环检测：childGraphId 链成环时抛错（数据损坏）', () => {
        // sub-a 内节点指向 sub-b；sub-b 内节点指向 sub-a
        const graphA = makeGraph('sub-a' as GraphId, [
            makeKnowledgeNode('sub-b' as GraphId),
        ])
        const graphB = makeGraph('sub-b' as GraphId, [
            makeKnowledgeNode('sub-a' as GraphId),
        ])
        const lookup = makeLookup([graphA, graphB])

        expect(() =>
            deriveAbstractionLevel(
                lookup,
                makeKnowledgeNode('sub-a' as GraphId),
            ),
        ).toThrow(/成环/)
    })

    test('DAG 共享子图：同一子图被多节点引用不误判环', () => {
        // sub-shared 被 sub-a 和 sub-b 两个节点引用（DAG，非环）
        const shared = makeGraph('sub-shared' as GraphId, [makeKnowledgeNode()])
        const graphA = makeGraph('sub-a' as GraphId, [
            makeKnowledgeNode('sub-shared' as GraphId),
        ])
        const graphB = makeGraph('sub-b' as GraphId, [
            makeKnowledgeNode('sub-shared' as GraphId),
        ])
        const lookup = makeLookup([shared, graphA, graphB])

        // 入口 → sub-a → sub-shared → 原子 = 2
        expect(
            deriveAbstractionLevel(
                lookup,
                makeKnowledgeNode('sub-a' as GraphId),
            ),
        ).toBe(2)
    })

    test('引用节点携带 childGraphId 时推导与知识节点一致', () => {
        const child = makeGraph('sub-r' as GraphId, [])
        const lookup = makeLookup([child])
        expect(
            deriveAbstractionLevel(
                lookup,
                makeReferenceNode('sub-r' as GraphId),
            ),
        ).toBe(1)
    })
})
