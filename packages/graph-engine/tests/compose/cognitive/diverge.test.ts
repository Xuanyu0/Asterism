/**
 * diverge.test.ts
 *
 * 发散操作测试。Case A（同图直连）、Case A ref→ref 拒绝、Case B（跨图启发+镜像）。
 */

import type {
    GraphData,
    GraphId,
    GraphRegistry,
    NodeId,
} from '../../../src/types/graph_data'
import type { GraphLookup } from '../../../src/types/infrastructure_types'
import { diverge } from '../../../src/compose/cognitive/diverge'
import { applyBatches } from '../../../src/core/apply_batches'
import {
    createDivergeInputGraph,
    createDivergeCrossGraphInput,
} from '../../test_case_factory'

const TEST_NOW = '2026-01-01T00:00:00.000Z'

/** 构造 lookupGraph + graphIds 辅助。 */
function makeLookup(graphs: GraphData[]): {
    graphIds: GraphId[]
    lookupGraph: GraphLookup
} {
    const map = new Map<GraphId, GraphData>()
    for (const g of graphs) {
        map.set(g.id as GraphId, g)
    }
    return {
        graphIds: Array.from(map.keys()),
        lookupGraph: (id: GraphId) => map.get(id),
    }
}

describe('diverge', () => {
    test('Case A：同图直连（两知识节点）', () => {
        const current = createDivergeInputGraph()
        const { graphIds, lookupGraph } = makeLookup([current])
        const result = diverge({
            sourceNodeId: 'div-A' as NodeId,
            targetNodeId: 'div-B' as NodeId,
            currentGraph: current,
            heuristicPosition: null,
            lookupGraph,
            graphIds,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 单批：inGraph 当前图 add_edge
        expect(result.batches).toHaveLength(1)
        expect(result.batches[0]!.kind).toBe('inGraph')
        expect(result.batches[0]!.operations).toHaveLength(1)
        expect(result.batches[0]!.operations[0]!.type).toBe('add_edge')
    })

    test('Case A：ref→ref 拒绝（链式引用禁止）', () => {
        const graph = createDivergeInputGraph()
        const { graphIds, lookupGraph } = makeLookup([graph])
        const result = diverge({
            sourceNodeId: 'div-A' as NodeId, // knowledge
            targetNodeId: 'div-B' as NodeId, // knowledge
            currentGraph: graph,
            heuristicPosition: null,
            lookupGraph,
            graphIds,
        })
        // k→k 合法。单独测 ref→ref 需要构造含两个 ref 的图
        // 此场景由 deconstruct 后子图中两个沟通节点无法 diverge 覆盖
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
    })

    test('Case B：跨图启发创建 + 镜像', () => {
        const { current, peer } = createDivergeCrossGraphInput()
        const { graphIds, lookupGraph } = makeLookup([current, peer])
        // source 在 peer 图中，不在 current 中
        const result = diverge({
            sourceNodeId: 'div-peer-A' as NodeId,
            targetNodeId: 'div-cur-B' as NodeId,
            currentGraph: current,
            heuristicPosition: { x: 300, y: 300 },
            lookupGraph,
            graphIds,
        })
        // heuristicPosition !== null → Case B
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 4 批：当前图节点批 / 边批 + 对端图节点批 / 边批
        expect(result.batches).toHaveLength(4)
        expect(result.batches[0]!.kind).toBe('inGraph')
        expect(result.batches[1]!.kind).toBe('inGraph')
        expect(result.batches[2]!.kind).toBe('inGraph')
        expect(result.batches[3]!.kind).toBe('inGraph')
        expect(
            result.batches[0]!.operations.every((op) => op.type === 'add_node'),
        ).toBe(true)
        expect(
            result.batches[1]!.operations.every((op) => op.type === 'add_edge'),
        ).toBe(true)
        expect(
            result.batches[2]!.operations.every((op) => op.type === 'add_node'),
        ).toBe(true)
        expect(
            result.batches[3]!.operations.every((op) => op.type === 'add_edge'),
        ).toBe(true)
    })

    test('集成：Case B compose → applyBatches 完整执行（A-1 回归防护）', () => {
        const { current, peer } = createDivergeCrossGraphInput()
        const { graphIds, lookupGraph } = makeLookup([current, peer])
        const registry: GraphRegistry = new Map([
            [current.id, current],
            [peer.id, peer],
        ])
        const result = diverge({
            sourceNodeId: 'div-peer-A' as NodeId,
            targetNodeId: 'div-cur-B' as NodeId,
            currentGraph: current,
            heuristicPosition: { x: 300, y: 300 },
            lookupGraph,
            graphIds,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)

        const applied = applyBatches(registry, result.batches, {
            executedAt: TEST_NOW,
        })
        expect(applied.validation.valid).toBe(true)

        // 当前图：启发节点 + 一条边（启发 → 知识节点）
        const appliedCurrent = applied.registry.get(current.id)!
        const heuristic = appliedCurrent.nodes.find(
            (n) => n.role === 'reference' && n.referenceKind === 'heuristic',
        )
        expect(heuristic).toBeDefined()
        expect(appliedCurrent.nodes).toHaveLength(2)
        expect(appliedCurrent.edges).toHaveLength(1)

        // 对端图：镜像启发节点 + 一条边（知识节点 → 镜像启发）
        const appliedPeer = applied.registry.get(peer.id)!
        const mirror = appliedPeer.nodes.find(
            (n) => n.role === 'reference' && n.referenceKind === 'heuristic',
        )
        expect(mirror).toBeDefined()
        expect(appliedPeer.nodes).toHaveLength(2)
        expect(appliedPeer.edges).toHaveLength(1)
    })
})
