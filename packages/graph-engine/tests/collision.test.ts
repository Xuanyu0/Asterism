/**
 * collision.test.ts
 *
 * 测试 hasCollisionAt 和 hasCollisionInDrafts。
 */

import {
    hasCollisionAt,
    hasCollisionInDrafts,
} from '../src/infrastructure/collision'
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

const emptyMap: NodeRadiusMap = new Map()

// ═══════════ hasCollisionAt ═══════════

describe('hasCollisionAt', () => {
    test('returns false when no overlap', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(200, 0))]

        expect(hasCollisionAt('a', pos(50, 0), nodes, emptyMap)).toBe(false)
    })

    test('returns true when overlapping another node', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(30, 0))]

        expect(hasCollisionAt('a', pos(0, 0), nodes, emptyMap)).toBe(true)
    })

    test('returns false for unknown node id', () => {
        expect(hasCollisionAt('missing', pos(0, 0), [], emptyMap)).toBe(false)
    })

    test('respects NodeRadiusMap override', () => {
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(30, 0))]

        const map: NodeRadiusMap = new Map([
            ['a', 10],
            ['b', 10],
        ])
        expect(hasCollisionAt('a', pos(0, 0), nodes, map)).toBe(false)

        expect(hasCollisionAt('a', pos(15, 0), nodes, map)).toBe(true)
    })

    test('excludes target node from check', () => {
        const nodes = [kn('a', pos(0, 0))]

        expect(hasCollisionAt('a', pos(100, 0), nodes, emptyMap)).toBe(false)
    })
})

// ═══════════ hasCollisionInDrafts ═══════════

describe('hasCollisionInDrafts', () => {
    test('returns false for empty drafts', () => {
        expect(hasCollisionInDrafts([], [], emptyMap)).toBe(false)
    })

    test('returns false for single draft with no other nodes', () => {
        expect(
            hasCollisionInDrafts(
                [{ nodeId: 'a', position: pos(50, 0) }],
                [],
                emptyMap,
            ),
        ).toBe(false)
    })

    test('detects collision between two drafts', () => {
        const drafts = [
            { nodeId: 'a', position: pos(0, 0) },
            { nodeId: 'b', position: pos(30, 0) },
        ]
        expect(hasCollisionInDrafts(drafts, [], emptyMap)).toBe(true)
    })

    test('returns false when drafts are far apart', () => {
        const drafts = [
            { nodeId: 'a', position: pos(0, 0) },
            { nodeId: 'b', position: pos(200, 0) },
        ]
        expect(hasCollisionInDrafts(drafts, [], emptyMap)).toBe(false)
    })

    test('detects draft vs existing node collision', () => {
        const nodes = [kn('b', pos(50, 0))]
        const drafts = [{ nodeId: 'a', position: pos(60, 0) }]
        expect(hasCollisionInDrafts(drafts, nodes, emptyMap)).toBe(true)
    })

    test('excludes draft nodeId when checking vs existing nodes', () => {
        // node 'a' 在 GraphData 中已存在，位置 pos(0,0)
        // 草稿将其移至 pos(100,0)。node 'b' 在 pos(500,0) 很远。
        // 排除自身后应无碰撞。
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(500, 0))]
        const drafts = [{ nodeId: 'a', position: pos(100, 0) }]
        expect(hasCollisionInDrafts(drafts, nodes, emptyMap)).toBe(false)
    })

    test('detects draft-vs-draft collision regardless of allNodes', () => {
        // 两个草稿互碰，即使它们在 allNodes 中已有位置（应排除自身）
        const nodes = [kn('a', pos(0, 0)), kn('b', pos(200, 0))]
        const drafts = [
            { nodeId: 'a', position: pos(0, 0) },
            { nodeId: 'b', position: pos(10, 0) }, // d=10, minDist=112 → 碰撞
        ]
        expect(hasCollisionInDrafts(drafts, nodes, emptyMap)).toBe(true)
    })

    test('uses existing node radius from GraphData when available', () => {
        // node 'a' 有 degree 导致更大半径，草稿应使用其已有半径
        const nodes = [kn('a', pos(0, 0), /* degree = */ 3)]
        const drafts = [
            { nodeId: 'a', position: pos(100, 0) },
            { nodeId: 'b', position: pos(50, 0) }, // 半径回退为 unitDistance
        ]
        expect(hasCollisionInDrafts(drafts, nodes, emptyMap)).toBe(true)
    })

    test('respects nodeRadiusOverrides', () => {
        const drafts = [
            { nodeId: 'a', position: pos(0, 0) },
            { nodeId: 'b', position: pos(15, 0) },
        ]
        // r=10 覆盖，minDist=20, d=15 → 碰撞
        const map: NodeRadiusMap = new Map([
            ['a', 10],
            ['b', 10],
        ])
        expect(hasCollisionInDrafts(drafts, [], map)).toBe(true)

        // r=10, d=25 → 无碰撞
        const drafts2 = [
            { nodeId: 'a', position: pos(0, 0) },
            { nodeId: 'b', position: pos(25, 0) },
        ]
        expect(hasCollisionInDrafts(drafts2, [], map)).toBe(false)
    })
})
