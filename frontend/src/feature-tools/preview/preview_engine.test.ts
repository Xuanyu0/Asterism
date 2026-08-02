/**
 * 说明：
 *
 *     previewAddEdge / previewMoveNode 的单元测试。
 *     覆盖：稀疏图不碰撞对、密集图两端碰撞、单端碰撞、degree +1、
 *     入参隔离（JSON 序列化克隆，兼容响应式 Proxy）、校验失败路径、
 *     kind / direction 透传、移动位置与碰撞判定。
 */

import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { reactive } from 'vue'
import { previewAddEdge, previewMoveNode } from './preview_engine'

import type { EdgeData, GraphData, GraphId, NodeData, NodeId } from '@my-project/graph-engine'


describe('previewAddEdge', () => {
    let golden: GraphData

    beforeEach(() => {
        localStorage.clear()
        golden = createGoldenTestGraphV2()
    })

    describe('金牌图（稀疏）', () => {
        test('不碰撞对返回 valid 且两端 false，previewGraph 含新边', () => {
            const result = previewAddEdge(golden, { sourceId: 'node-g1' as NodeId, targetId: 'node-g6' as NodeId, kind: 'real', direction: 'directed' })

            expect(result.valid).toBe(true)
            expect(result.sourceCollides).toBe(false)
            expect(result.targetCollides).toBe(false)
            expect(result.previewGraph.edges.length).toBe(golden.edges.length + 1)
            expect(result.previewGraph.edges.some(edge => edge.source === 'node-g1' && edge.target === 'node-g6')).toBe(true)
        })

        test('previewGraph 中 source/target degree 比原图 +1，其他节点不变', () => {
            const result = previewAddEdge(golden, { sourceId: 'node-g1' as NodeId, targetId: 'node-g6' as NodeId, kind: 'real', direction: 'directed' })

            const g1 = result.previewGraph.nodes.find(node => node.id === 'node-g1')
            const g6 = result.previewGraph.nodes.find(node => node.id === 'node-g6')
            const g2 = result.previewGraph.nodes.find(node => node.id === 'node-g2')

            expect(g1?.degree).toBe(3)  // 原 2
            expect(g6?.degree).toBe(2)  // 原 1
            expect(g2?.degree).toBe(2)  // 不变
        })

        test('不修改入参 graph', () => {
            const edgesBefore = golden.edges.length

            const result = previewAddEdge(golden, { sourceId: 'node-g1' as NodeId, targetId: 'node-g6' as NodeId, kind: 'real', direction: 'directed' })

            expect(golden.edges.length).toBe(edgesBefore)
            expect(golden.nodes.find(node => node.id === 'node-g1')?.degree).toBe(2)
            expect(result.previewGraph).not.toBe(golden)
        })

        test('kind / direction 透传到新边', () => {
            const result = previewAddEdge(golden, { sourceId: 'node-g2' as NodeId, targetId: 'node-g6' as NodeId, kind: 'virtual', direction: 'undirected' })

            expect(result.valid).toBe(true)

            const edge = result.previewGraph.edges.find(e => e.source === 'node-g2' && e.target === 'node-g6')
            expect(edge?.kind).toBe('virtual')
            expect(edge?.direction).toBe('undirected')
        })

        test('端点不存在时返回 valid: false 且碰撞布尔为 false', () => {
            const result = previewAddEdge(golden, { sourceId: 'node-g1' as NodeId, targetId: 'node-missing' as NodeId, kind: 'real', direction: 'directed' })

            expect(result.valid).toBe(false)
            expect(result.sourceCollides).toBe(false)
            expect(result.targetCollides).toBe(false)
            expect(result.previewGraph.edges.length).toBe(golden.edges.length)
        })
    })

    describe('自定义密集图（碰撞）', () => {
        // 加边前各节点互不重叠（degree 0 时 minDist = 84）；加边后端点 degree+1，
        // 半径扩大为 unitDistance * sqrt(1 + degree)，与 90 距离的邻居重叠
        test('两端都与各自邻居碰撞', () => {
            const graph = buildGraph([
                node('s', 0, 0),
                node('t', 300, 0),
                node('x', 90, 0),
                node('y', 210, 0),
            ])

            const result = previewAddEdge(graph, { sourceId: 's' as NodeId, targetId: 't' as NodeId, kind: 'real', direction: 'directed' })

            expect(result.valid).toBe(true)
            expect(result.sourceCollides).toBe(true)
            expect(result.targetCollides).toBe(true)
        })

        test('仅 source 端碰撞', () => {
            const graph = buildGraph([
                node('s', 0, 0),
                node('t', 300, 0),
                node('x', 90, 0),
            ])

            const result = previewAddEdge(graph, { sourceId: 's' as NodeId, targetId: 't' as NodeId, kind: 'real', direction: 'directed' })

            expect(result.sourceCollides).toBe(true)
            expect(result.targetCollides).toBe(false)
        })

        test('仅 target 端碰撞', () => {
            const graph = buildGraph([
                node('s', 0, 0),
                node('t', 300, 0),
                node('y', 210, 0),
            ])

            const result = previewAddEdge(graph, { sourceId: 's' as NodeId, targetId: 't' as NodeId, kind: 'real', direction: 'directed' })

            expect(result.sourceCollides).toBe(false)
            expect(result.targetCollides).toBe(true)
        })

        test('source 与 target 互碰（回归：B2 误放行）', () => {
            // s(0,0) 与 t(100,0) 相距 100。加边后两者 degree 1、
            // 半径 = 42*sqrt(2) ≈ 59.4，半径和 ≈ 118.8 > 100 → 视觉重叠。
            // 修复前 hasCollisionAt 排除对端 → 误判无碰撞 → 点击执行。
            const graph = buildGraph([
                node('s', 0, 0),
                node('t', 100, 0),
            ])

            const result = previewAddEdge(graph, { sourceId: 's' as NodeId, targetId: 't' as NodeId, kind: 'real', direction: 'directed' })

            expect(result.valid).toBe(true)
            expect(result.sourceCollides).toBe(true)
            expect(result.targetCollides).toBe(true)
        })
    })

    describe('响应式 Proxy 图（模拟 Pinia graphView）', () => {
        test('reactive 包裹的图可正常预览（回归：structuredClone 抛 DataCloneError）', () => {
            // graphStore.graphView 是 Vue 响应式 Proxy，structuredClone 无法克隆
            // Proxy。preview_engine 必须兼容响应式图数据。
            const reactiveGraph = reactive(golden)

            const result = previewAddEdge(
                reactiveGraph as unknown as GraphData,
                { sourceId: 'node-g1' as NodeId, targetId: 'node-g6' as NodeId, kind: 'real', direction: 'directed' },
            )

            expect(result.valid).toBe(true)
            expect(result.sourceCollides).toBe(false)
            expect(result.targetCollides).toBe(false)
            expect(result.previewGraph.edges.length).toBe(golden.edges.length + 1)
        })
    })
})


describe('previewMoveNode', () => {
    let golden: GraphData

    beforeEach(() => {
        localStorage.clear()
        golden = createGoldenTestGraphV2()
    })

    test('移动到空位：collides false，previewGraph 中目标节点位置已更新，其他节点不变', () => {
        const result = previewMoveNode(golden, 'node-g1' as NodeId, { x: 1000, y: 400 })

        expect(result.collides).toBe(false)
        expect(result.previewGraph.nodes.find(node => node.id === 'node-g1')?.position)
            .toEqual({ x: 1000, y: 400 })
        expect(result.previewGraph.nodes.find(node => node.id === 'node-g2')?.position)
            .toEqual({ x: 350, y: 200 })
        expect(result.previewGraph.nodes.find(node => node.id === 'node-g3')?.position)
            .toEqual({ x: 650, y: 200 })
    })

    test('移动到 node-g2 所在位置 (350,200) → collides true', () => {
        const result = previewMoveNode(golden, 'node-g1' as NodeId, { x: 350, y: 200 })

        expect(result.collides).toBe(true)
        // 碰撞不阻止移动模拟——预览图仍生成新位置
        expect(result.previewGraph.nodes.find(node => node.id === 'node-g1')?.position)
            .toEqual({ x: 350, y: 200 })
    })

    test('不修改入参 graph', () => {
        const result = previewMoveNode(golden, 'node-g1' as NodeId, { x: 1000, y: 400 })

        expect(golden.nodes.find(node => node.id === 'node-g1')?.position)
            .toEqual({ x: 50, y: 200 })
        expect(result.previewGraph).not.toBe(golden)
    })

    test('reactive 包裹的图可正常预览（回归：structuredClone 抛 DataCloneError）', () => {
        const reactiveGraph = reactive(golden)

        const result = previewMoveNode(
            reactiveGraph as unknown as GraphData,
            'node-g1' as NodeId,
            { x: 1000, y: 400 },
        )

        expect(result.collides).toBe(false)
        expect(result.previewGraph.nodes.find(node => node.id === 'node-g1')?.position)
            .toEqual({ x: 1000, y: 400 })
    })
})


// ── 私有辅助：构造测试图 ──

function buildGraph(nodes: NodeData[], edges: EdgeData[] = []): GraphData {
    return {
        id: 'graph-test' as GraphId,
        kind: 'root',
        title: '测试图',
        nodes,
        edges,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    }
}

function node(id: string, x: number, y: number): NodeData {
    return {
        id: id as NodeId,
        graphId: 'graph-test' as GraphId,
        role: 'knowledge',
        kind: 'real',
        form: 'atomic',
        label: id,
        degree: 0,
        abstractionLevel: 0,
        position: { x, y },
    }
}
