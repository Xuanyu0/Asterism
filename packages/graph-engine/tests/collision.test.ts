/**
 * collision.test.ts
 *
 * 测试 constrainPosition 和 hasCollisionAt。
 */

import { describe, it, expect } from 'vitest'
import { constrainPosition, hasCollisionAt } from '../src/infrastructure/collision'
import type { NodeData, NodeRadiusMap } from '../src/types/graph_data'

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
            kn('b', pos(20, 0)), // r₀=28, overlap ~36px
        ]

        const result = constrainPosition('a', pos(0, 0), nodes, emptyMap)

        expect(result.adjusted).toBe(true)
        expect(result.position.x).toBeLessThan(-28)
        expect(result.position.y).toBe(0)
    })

    it('skips virtual nodes', () => {
        const nodes = [kn('a', pos(0, 0)), vn('v', pos(20, 0))]

        const result = constrainPosition('a', pos(0, 0), nodes, emptyMap)

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
        expect(constrainPosition('a', pos(0, 0), nodes, map).adjusted).toBe(false)

        // from at position(15,0) → d=15, minDist=24 → overlap
        const collision = constrainPosition('a', pos(15, 0), nodes, map)
        expect(collision.adjusted).toBe(true)
    })
})

// ═══════════ hasCollisionAt ═══════════

describe('hasCollisionAt', () => {
    it('returns false when no overlap', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(200, 0))]

        expect(hasCollisionAt('a', pos(50, 0), nodes, emptyMap)).toBe(false)
    })

    it('returns true when overlapping another node', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(30, 0))]

        expect(hasCollisionAt('a', pos(0, 0), nodes, emptyMap)).toBe(true)
    })

    it('skips virtual nodes', () => {
        const nodes = [kn('a', pos(0, 0)), vn('v', pos(20, 0))]

        expect(hasCollisionAt('a', pos(20, 0), nodes, emptyMap)).toBe(false)
    })

    it('returns false for unknown node id', () => {
        expect(hasCollisionAt('missing', pos(0, 0), [], emptyMap)).toBe(false)
    })

    it('respects NodeRadiusMap override', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(30, 0))]

        const map: NodeRadiusMap = new Map([['a', 10], ['b', 10]])
        expect(hasCollisionAt('a', pos(0, 0), nodes, map)).toBe(false)

        expect(hasCollisionAt('a', pos(15, 0), nodes, map)).toBe(true)
    })

    it('excludes target node from check', () => {
        const nodes = [kn('a', pos(0, 0))]

        expect(hasCollisionAt('a', pos(100, 0), nodes, emptyMap)).toBe(false)
    })
})
