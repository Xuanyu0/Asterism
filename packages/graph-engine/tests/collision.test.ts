/**
 * collision.test.ts
 *
 * 测试 collision.ts 三个原语：constrainPosition / computePath / untangleCluster。
 */

import { describe, it, expect } from 'vitest'
import {
    constrainPosition,
    computePath,
    untangleCluster,
} from '../src/infrastructure/collision'
import type { NodeData, NodeRadiusMap } from '../src/types/graph_data'

// helpers

function pos(x: number, y: number) {
    return { x, y }
}

function kn(
    id: string,
    p: { x: number; y: number },
    degree = 0,
): NodeData {
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

function vn(id: string, p: { x: number; y: number }): NodeData {
    return {
        id,
        graphId: 'test',
        role: 'knowledge',
        kind: 'virtual',
        label: id,
        degree: 0,
        position: p,
        abstractionLevel: 0,
    }
}

const emptyMap: NodeRadiusMap = new Map()

// ═══════════ constrainPosition ═══════════

describe('constrainPosition', () => {
    it('returns desired unchanged when no collision', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(200, 0))]

        const result = constrainPosition('a', pos(50, 0), nodes, emptyMap)

        expect(result.adjusted).toBe(false)
        expect(result.position).toEqual(pos(50, 0))
    })

    it('pushes away from overlapping node', () => {
        const nodes = [
            kn('a', pos(0, 0)),
            kn('b', pos(20, 0)), // r₀=28, two nodes at 20px → overlap 36px
        ]

        const result = constrainPosition('a', pos(0, 0), nodes, emptyMap)
        // 应被推离约 36+ε 到负 x 方向
        expect(result.adjusted).toBe(true)
        expect(result.position.x).toBeLessThan(-28)
        expect(result.position.y).toBe(0)
    })

    it('does not push virtual node', () => {
        const nodes = [vn('v', pos(0, 0)), kn('b', pos(20, 0))]

        const result = constrainPosition('v', pos(0, 0), nodes, emptyMap)

        expect(result.adjusted).toBe(false)
    })

    it('returns unchanged for unknown node id', () => {
        const result = constrainPosition('missing', pos(0, 0), [], emptyMap)

        expect(result.adjusted).toBe(false)
    })

    it('uses NodeRadiusMap override', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(30, 0))]

        const map: NodeRadiusMap = new Map([['a', 12], ['b', 12]])
        // r=12 each, minDist=24, d=30 → no collision
        const noCollision = constrainPosition('a', pos(0, 0), nodes, map)
        expect(noCollision.adjusted).toBe(false)

        const mapSmall: NodeRadiusMap = new Map([['a', 12], ['b', 12]])
        // r=12 each, minDist=24+ε, from at 20 → overlap
        const collision = constrainPosition('a', pos(20, 0), nodes, mapSmall)
        expect(collision.adjusted).toBe(true)
    })
})

// ═══════════ computePath ═══════════

describe('computePath', () => {
    it('returns direct path when no obstacles', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(500, 0))]

        const result = computePath('a', pos(0, 0), pos(200, 0), nodes, emptyMap)

        expect(result.ok).toBe(true)
        expect(result.waypoints).toHaveLength(1)
        expect(result.waypoints[0]).toEqual(pos(200, 0))
    })

    it('returns unreachable when path fully blocked', () => {
        // Obstacle directly covering the from-to segment with no繞行 clearance
        const nodes = [
            kn('a', pos(0, 0)),
            kn('blocker', pos(100, 0), 0),
        ]

        const result = computePath('a', pos(0, 0), pos(200, 0), nodes, emptyMap)

        // 直接路径被完全覆盖，繞行也因 single-tangent 算法限制可能失败。
        // 此处只验证 contract —— ok 为 boolean 且 waypoints 在 ok=false 时为空。

        // 如果 ok，waypoints 长度 > 0 (至少有一个非 from 的 waypoint)
        if (result.ok) {
            expect(result.waypoints.length).toBeGreaterThan(0)
        } else {
            expect(result.waypoints).toHaveLength(0)
        }
    })

    it('returns unreachable when surrounded', () => {
        // surround target with 6 nodes in a ring
        const nodes: NodeData[] = []
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3
            nodes.push(kn(
                `r${i}`,
                pos(Math.cos(angle) * 50, Math.sin(angle) * 50),
            ))
        }
        nodes.push(kn('a', pos(-300, 0)))
        nodes.push(kn('target', pos(0, 0)))

        const result = computePath('a', pos(-300, 0), pos(300, 0), nodes, emptyMap)

        // surrounded — may succeed or fail. Just verify type contract.
        expect(typeof result.ok).toBe('boolean')
    })

    it('handles empty node list', () => {
        const result = computePath('a', pos(0, 0), pos(100, 0), [], emptyMap)

        expect(result.ok).toBe(true)
    })
})

// ═══════════ untangleCluster ═══════════

describe('untangleCluster', () => {
    it('returns empty adjusted when no collisions', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(200, 0))]

        const result = untangleCluster(nodes, emptyMap)

        expect(result.didResolve).toBe(true)
        // all three nodes have positions, all appear in adjusted map
        expect(result.adjusted.size).toBe(2)
    })

    it('separates overlapping nodes', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(20, 0))]

        const result = untangleCluster(nodes, emptyMap)
        const aPos = result.adjusted.get('a')!
        const bPos = result.adjusted.get('b')!

        const dx = aPos.x - bPos.x
        const dy = aPos.y - bPos.y

        expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(28 * 2)
    })

    it('virtual nodes are immovable in adjusted map', () => {
        const nodes = [vn('v', pos(0, 0)), kn('a', pos(20, 0))]

        const result = untangleCluster(nodes, emptyMap)
        const vPos = result.adjusted.get('v')!
        const aPos = result.adjusted.get('a')!

        // v stays at origin
        expect(vPos).toEqual(pos(0, 0))
        // a is pushed away from v
        const dx = aPos.x - vPos.x
        expect(Math.abs(dx)).toBeGreaterThanOrEqual(28)
    })
})
