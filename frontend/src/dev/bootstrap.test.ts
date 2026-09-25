/**
 * bootstrap.test.ts
 *
 * 功能：
 *     dev 种子的单元测试：金 / 银同树（银图挂进金图树内）、种子零跨树引用、
 *     两条引用节点保留、以及 bootstrapDevTools 的幂等性。
 *
 * 规则：
 *     1. 断言作用在持久化数据上（bootstrap 经操作路径写入的最终结果）。
 *     2. 树归属判定复用 graph_tree.ts 的 isInGraphTree，不另写遍历。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { resetGraphStoreForTests } from '@/graph/graph_store'
import { isInGraphTree } from '@/graph/utils/graph_tree'
import { listGraphIds, loadGraph } from '@/persistence'
import * as medium from '@/persistence/medium/local_storage'

import { bootstrapDevTools } from './bootstrap'

const GOLDEN_ROOT = 'graph-golden' as GraphId

describe('bootstrapDevTools 种子', () => {
    beforeEach(() => {
        resetGraphStoreForTests()
        medium.resetMediumForTests()
    })

    afterAll(() => {
        medium.resetMediumForTests()
    })

    test('金 / 银同树：种子不存在跨树引用，两条引用节点保留', () => {
        bootstrapDevTools()

        const graphs = loadAllGraphs()
        expect(graphs.map((graph) => graph.id).sort()).toEqual([
            'graph-golden',
            'graph-silver',
            'sub-golden',
            'sub-silver',
        ])

        const golden = graphs.find((graph) => graph.id === GOLDEN_ROOT)
        const silver = graphs.find((graph) => graph.id === 'graph-silver')
        expect(golden).toBeDefined()
        expect(silver).toBeDefined()
        if (!golden || !silver) return

        // 银图由独立根图改为挂在金图树内的子图
        expect(silver.kind).toBe('subgraph')
        expect(silver.parentGraphId).toBe(GOLDEN_ROOT)

        // 两条引用节点保留：金 → 银、银 → 金
        expect(
            golden.nodes.some(
                (node) => node.role === 'reference' && node.id === 'node-g5' && node.sourceGraphId === 'graph-silver',
            ),
        ).toBe(true)
        expect(
            silver.nodes.some(
                (node) => node.role === 'reference' && node.id === 'sv-node-4' && node.sourceGraphId === 'graph-golden',
            ),
        ).toBe(true)

        // 全部图同树；每个 childGraphId / sourceGraphId 目标存在且同树
        for (const graph of graphs) {
            expect(isInGraphTree(graph, GOLDEN_ROOT)).toBe(true)

            for (const targetId of collectReferenceTargets(graph)) {
                expect(
                    graphs.some((candidate) => candidate.id === targetId),
                    `${graph.id} 指向不存在的图 ${targetId}`,
                ).toBe(true)
                const target = graphs.find((candidate) => candidate.id === targetId)!
                expect(isInGraphTree(target, GOLDEN_ROOT)).toBe(true)
            }
        }
    })

    test('幂等：连续调用两次不产生重复图或重复注入', () => {
        bootstrapDevTools()
        const before = snapshotGraphs()
        bootstrapDevTools()
        const after = snapshotGraphs()

        expect(after).toEqual(before)
    })
})

/** 读取持久化中的全部图。 */
function loadAllGraphs(): GraphData[] {
    const listed = listGraphIds()
    if (!listed.ok) throw new Error('种子测试：持久化图枚举失败')

    const graphs: GraphData[] = []
    for (const graphId of listed.value) {
        const result = loadGraph(graphId)
        if (!result.ok) throw new Error(`种子测试：图读取失败 ${graphId}`)
        graphs.push(result.value)
    }
    return graphs
}

/** 节点指向其他图的语义引用目标：知识节点的 childGraphId、引用节点的 sourceGraphId。 */
function collectReferenceTargets(graph: GraphData): GraphId[] {
    const targetIds: GraphId[] = []
    for (const node of graph.nodes) {
        if (node.role === 'knowledge' && node.childGraphId) targetIds.push(node.childGraphId)
        if (node.role === 'reference') targetIds.push(node.sourceGraphId)
    }
    return targetIds
}

/** 全量图快照（id → 节点 / 边数），用于幂等性比对。 */
function snapshotGraphs(): Record<string, { nodes: number; edges: number }> {
    const snapshot: Record<string, { nodes: number; edges: number }> = {}
    for (const graph of loadAllGraphs()) {
        snapshot[graph.id] = { nodes: graph.nodes.length, edges: graph.edges.length }
    }
    return snapshot
}
