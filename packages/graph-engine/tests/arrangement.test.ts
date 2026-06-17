/**
 * arrangement.test.ts
 *
 * 测试 compose/arrangement/ 下的编排函数。
 */

import { describe, it, expect } from 'vitest'
import { moveNode } from '../src/compose/arrangement/move'
import { adjustDistance, adjustOrbit } from '../src/compose/arrangement/adjust'
import { orbit } from '../src/compose/arrangement/orbit'
import { pathLayout } from '../src/compose/arrangement/path'
import type { NodeData, EdgeData, NodeRadiusMap } from '../src/types/graph_data'

function pos(x: number, y: number) {
    return { x, y }
}

function kn(id: string, p: { x: number; y: number }, degree = 0): NodeData {
    return {
        id,
        graphId: 'test',
        role: 'knowledge',
        kind: 'real',
        label: id,
        degree,
        position: p,
        abstractionLevel: 0,
    }
}

const emptyMap: NodeRadiusMap = new Map()

// ═══════════ moveNode ═══════════

describe('moveNode', () => {
    it('returns no issues when target position is free', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(200, 0))]

        const result = moveNode({
            nodeId: 'a',
            desiredPosition: pos(50, 0),
            allNodes: nodes,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues).toHaveLength(0)
        expect(result.drafts).toHaveLength(1)
        expect(result.drafts[0].nodeId).toBe('a')
        expect(result.drafts[0].position).toEqual(pos(50, 0))
        expect(result.operations).toHaveLength(1)
        expect(result.operations[0].type).toBe('move_node')
    })

    it('returns error issue when target position collides', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(30, 0))]

        const result = moveNode({
            nodeId: 'a',
            desiredPosition: pos(0, 0),
            allNodes: nodes,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
        expect(result.issues[0].severity).toBe('error')
        // operations 仍然生成——前端按 issues 决定是否提交
        expect(result.operations).toHaveLength(1)
    })

    it('excludes target node from collision check', () => {
        // 移到远处，不碰
        const nodes = [kn('a', pos(0, 0))]
        const result = moveNode({
            nodeId: 'a',
            desiredPosition: pos(100, 0),
            allNodes: nodes,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues).toHaveLength(0)
    })
})

// ═══════════ adjustDistance ═══════════

describe('adjustDistance', () => {
    it('returns draft position on circle at given distance and angle', () => {
        const nodes = [kn('a', pos(0, 0))]

        const result = adjustDistance({
            nodeId: 'a',
            center: pos(0, 0),
            distance: 100,
            angle: Math.PI / 2,       // 正上方
            allNodes: nodes,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues).toHaveLength(0)
        expect(result.drafts).toHaveLength(1)
        expect(result.drafts[0].position.x).toBeCloseTo(0, 0)
        expect(result.drafts[0].position.y).toBeCloseTo(100, 0)
        expect(result.operations[0].type).toBe('move_node')
    })

    it('returns error when target position collides', () => {
        const nodes = [kn('a', pos(50, 0)), kn('b', pos(60, 0))]
        // r₀=56, minDist=112, d=10 → 碰撞
        const result = adjustDistance({
            nodeId: 'a',
            center: pos(50, 0),
            distance: 10,
            angle: 0,
            allNodes: nodes,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
        expect(result.issues[0].severity).toBe('error')
    })
})

// ═══════════ adjustOrbit ═══════════

describe('adjustOrbit', () => {
    const D0 = 200

    it('snaps cursor distance to nearest tier', () => {
        // 光标距中心 350 → 最近轨道 (n+1)*200：n=0→200, n=1→400 → 选 n=1 (tier 1)
        const nodes = [kn('a', pos(0, 0))]

        const result = adjustOrbit({
            nodeId: 'a',
            center: pos(0, 0),
            cursor: pos(350, 0),
            D0,
            tierCount: 5,
            allNodes: nodes,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues).toHaveLength(0)
        const draft = result.drafts[0] as { nodeId: string; position: { x: number; y: number }; tier: number; angle: number }
        expect(draft.tier).toBe(1)
        expect(draft.angle).toBeCloseTo(0, 1)
        // 吸附位置：半径 = (1+1)*200 = 400, 角度 0
        expect(draft.position.x).toBeCloseTo(400, -1)
        expect(draft.position.y).toBeCloseTo(0, -1)
    })

    it('returns error when snapped position collides', () => {
        // 光标吸附到 tier 0 (r=200), 正好撞上已存在的 b 在 pos(180,0)
        // r₀=56 × 2, minDist=112, d=180-200=-20 → 实际 d=20 < 112 → 碰撞
        const nodes = [
            kn('a', pos(0, 0)),
            kn('b', pos(200, 0)),    // 恰好也在 tier 0 轨道上
        ]

        const result = adjustOrbit({
            nodeId: 'a',
            center: pos(0, 0),
            cursor: pos(190, 0),     // 距中心 190，最近轨道 n=0 (r=200)
            D0,
            tierCount: 5,
            allNodes: nodes,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
        expect(result.issues[0].severity).toBe('error')
    })
})

// ═══════════ orbit ═══════════

function edge(centerId: string, satelliteId: string, kind: 'real' | 'virtual' = 'real'): EdgeData {
    return {
        id: `${centerId}-${satelliteId}`,
        graphId: 'test',
        source: centerId,
        target: satelliteId,
        kind,
        direction: 'directed',
    }
}

describe('orbit', () => {
    it('places satellites on assigned tiers around center', () => {
        const nodes = [
            kn('center', pos(0, 0), /* degree = */ 2),
            kn('sat1', pos(300, 0)),
            kn('sat2', pos(0, 300)),
        ]
        const edges = [edge('center', 'sat1'), edge('center', 'sat2')]

        const result = orbit({
            center: { id: 'center', position: pos(0, 0), radius: 56 },
            satellites: [
                { id: 'sat1', radius: 56 },
                { id: 'sat2', radius: 56 },
            ],
            tiers: [{ tier: 0, nodeIds: ['sat1', 'sat2'] }],
            allNodes: nodes,
            allEdges: edges,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues).toHaveLength(0)
        expect(result.drafts).toHaveLength(2)
    })

    it('returns error for satellite without real edge to center', () => {
        const nodes = [
            kn('center', pos(0, 0)),
            kn('sat1', pos(300, 0)),
        ]
        const result = orbit({
            center: { id: 'center', position: pos(0, 0), radius: 56 },
            satellites: [{ id: 'sat1', radius: 56 }],
            tiers: [{ tier: 0, nodeIds: ['sat1'] }],
            allNodes: nodes,
            allEdges: [],
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
        expect(result.issues[0].severity).toBe('error')
        expect(result.issues[0].message).toContain('实边')
    })

    it('returns error for virtual edge', () => {
        const nodes = [kn('center', pos(0, 0)), kn('sat1', pos(300, 0))]
        const edges = [edge('center', 'sat1', 'virtual')]

        const result = orbit({
            center: { id: 'center', position: pos(0, 0), radius: 56 },
            satellites: [{ id: 'sat1', radius: 56 }],
            tiers: [{ tier: 0, nodeIds: ['sat1'] }],
            allNodes: nodes,
            allEdges: edges,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
    })

    it('returns error for satellite not assigned to any tier', () => {
        const nodes = [kn('center', pos(0, 0)), kn('sat1', pos(300, 0))]
        const edges = [edge('center', 'sat1')]

        const result = orbit({
            center: { id: 'center', position: pos(0, 0), radius: 56 },
            satellites: [{ id: 'sat1', radius: 56 }],
            tiers: [],
            allNodes: nodes,
            allEdges: edges,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
        expect(result.issues[0].message).toContain('未被分配')
    })
})

// ═══════════ pathLayout ═══════════

describe('pathLayout', () => {
    it('places path nodes along ray at equal spacing', () => {
        const nodes = [
            kn('axis', pos(0, 0)),
            kn('pn1', pos(100, 100)),
            kn('pn2', pos(200, 200)),
        ]
        const edges = [
            edge('axis', 'pn1'),
            edge('axis', 'pn2'),
        ]

        const result = pathLayout({
            axis: { id: 'axis', position: pos(0, 0) },
            pathNodes: [
                { id: 'pn1', radius: 56 },
                { id: 'pn2', radius: 56 },
            ],
            direction: 0,            // 沿 x 轴正方向
            spacing: 200,
            allNodes: nodes,
            allEdges: edges,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues).toHaveLength(0)
        expect(result.drafts).toHaveLength(2)
        // 第 1 个距原点 200，第 2 个距原点 400
        expect(result.drafts[0].position.x).toBeCloseTo(200, 0)
        expect(result.drafts[1].position.x).toBeCloseTo(400, 0)
    })

    it('returns error for path node with undirected edge', () => {
        const nodes = [kn('axis', pos(0, 0)), kn('pn1', pos(100, 0))]
        const edges = [{
            ...edge('axis', 'pn1'),
            direction: 'undirected' as const,
        }]

        const result = pathLayout({
            axis: { id: 'axis', position: pos(0, 0) },
            pathNodes: [{ id: 'pn1', radius: 56 }],
            direction: 0,
            spacing: 100,
            allNodes: nodes,
            allEdges: edges,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
    })

    it('returns error when draft positions collide', () => {
        // pn1 draft at pos(200,0), blocker at pos(200,0) → collision
        const nodes = [kn('axis', pos(0, 0)), kn('pn1', pos(50, 50)), kn('blocker', pos(200, 0))]
        const edges = [edge('axis', 'pn1')]

        const result = pathLayout({
            axis: { id: 'axis', position: pos(0, 0) },
            pathNodes: [{ id: 'pn1', radius: 56 }],
            direction: 0,
            spacing: 200,
            allNodes: nodes,
            allEdges: edges,
            nodeRadiusOverrides: emptyMap,
        })

        expect(result.issues.length).toBeGreaterThanOrEqual(1)
    })
})
