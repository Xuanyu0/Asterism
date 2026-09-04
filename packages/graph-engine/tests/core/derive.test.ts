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
    NodeId,
    ReferenceNodeData,
} from '../../src/types/graph_data'
import { deriveNodeForm, deriveAbstractionLevel } from '../../src/core/derive'

// ═══════════ 辅助 ═══════════

function makeKnowledgeNode(
    childGraphId?: GraphId,
    id: NodeId = 'n',
    graphId: GraphId = 'g',
): KnowledgeNodeData {
    return {
        id,
        graphId,
        role: 'knowledge',
        kind: 'real',
        label: id,
        degree: 0,
        childGraphId,
    }
}

function makeReferenceNode(
    sourceGraphId: GraphId,
    sourceNodeId: NodeId,
): ReferenceNodeData {
    return {
        id: 'r',
        graphId: 'g',
        role: 'reference',
        referenceKind: 'communication',
        sourceGraphId,
        sourceNodeId,
        label: 'r',
        degree: 0,
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

    test('引用节点解引用源节点推导，结果与源节点一致', () => {
        const child = makeGraph('sub-src' as GraphId, [])
        const sourceNode = makeKnowledgeNode(
            'sub-src' as GraphId,
            'src-node' as NodeId,
            'src-graph' as GraphId,
        )
        const sourceGraph = makeGraph('src-graph' as GraphId, [sourceNode])
        const referenceNode = makeReferenceNode(
            'src-graph' as GraphId,
            'src-node' as NodeId,
        )
        const lookup = makeLookup([child, sourceGraph])

        expect(deriveAbstractionLevel(lookup, referenceNode)).toBe(
            deriveAbstractionLevel(lookup, sourceNode),
        )
    })

    test('源节点不可达 → 0', () => {
        // 源图未注册
        const emptyLookup = makeLookup([])
        expect(
            deriveAbstractionLevel(
                emptyLookup,
                makeReferenceNode(
                    'missing-graph' as GraphId,
                    'src-node' as NodeId,
                ),
            ),
        ).toBe(0)

        // 源图存在但源节点缺失
        const graphWithoutSource = makeGraph('src-graph' as GraphId, [])
        const lookup = makeLookup([graphWithoutSource])
        expect(
            deriveAbstractionLevel(
                lookup,
                makeReferenceNode(
                    'src-graph' as GraphId,
                    'missing-node' as NodeId,
                ),
            ),
        ).toBe(0)
    })

    test('递归内部引用节点（沟通节点）不参与层级，不抛环错误', () => {
        // 父图含抽象节点 A（childGraphId → 子图）；子图含沟通节点 R 指向父图 A。
        // 若 R 参与层级并解引用，会回到父图 → A → 子图 → 成环；
        // 跳过 R 后，A 的层级 = 子图内 knowledge 节点（无）= 0 + 1 = 1。
        const communicationNode = makeReferenceNode(
            'parent' as GraphId,
            'node-a' as NodeId,
        )
        const childGraph = makeGraph('child' as GraphId, [communicationNode])
        const nodeA = makeKnowledgeNode(
            'child' as GraphId,
            'node-a' as NodeId,
            'parent' as GraphId,
        )
        const parentGraph = makeGraph('parent' as GraphId, [nodeA])
        const lookup = makeLookup([parentGraph, childGraph])

        expect(deriveAbstractionLevel(lookup, nodeA)).toBe(1)
    })
})
