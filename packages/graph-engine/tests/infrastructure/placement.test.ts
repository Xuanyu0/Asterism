/**
 * placement.test.ts
 *
 * 六函数测试：positionOnCircle / snapOrbit / distributeOnTiers /
 * distributeOnLine / scatterInCircle / computeTierSpacing。
 */

import { describe, it, expect } from 'vitest'
import type { NodeId } from '../../src/types/graph_data'
import { positionOnCircle, snapOrbit, distributeOnTiers, distributeOnLine, scatterInCircle, computeTierSpacing } from '../../src/infrastructure/placement'
import { distance } from '../../src/infrastructure/geometry'
import { DEFAULT_LAYOUT_RULES } from '../../src/core/rules'

const R0 = DEFAULT_LAYOUT_RULES.r0

describe('positionOnCircle', () => {
    it('角度 0 时在 x 轴正方向', () => {
        const pos = positionOnCircle({ x: 0, y: 0 }, 100, 0)
        expect(pos.x).toBeCloseTo(100, 5)
        expect(pos.y).toBeCloseTo(0, 5)
    })

    it('角度 π/2 时在 y 轴正方向', () => {
        const pos = positionOnCircle({ x: 0, y: 0 }, 100, Math.PI / 2)
        expect(pos.x).toBeCloseTo(0, 5)
        expect(pos.y).toBeCloseTo(100, 5)
    })
})

describe('snapOrbit', () => {
    it('吸附至最近层级', () => {
        const center = { x: 0, y: 0 }
        // 距离 2.5 * R0 的 cursor 应吸附至 tier 1 (轨道半径 = 2*R0) 而非 tier 0 (半径=R0)
        const cursor = { x: 2.5 * R0, y: 0 }
        const snapped = snapOrbit(center, cursor, R0, 3)
        expect(snapped.tier).toBe(1)
        const dist = distance(center, snapped.position)
        expect(dist).toBeCloseTo(2 * R0, 0)
    })
})

describe('distributeOnTiers', () => {
    it('单层均分圆周', () => {
        const center = { id: 'c' as NodeId, position: { x: 0, y: 0 }, radius: 10 }
        const satellites = [
            { id: 'a' as NodeId, radius: 5 },
            { id: 'b' as NodeId, radius: 5 },
            { id: 'c-sat' as NodeId, radius: 5 },
        ]
        const tiers = [{ tier: 0, nodeIds: ['a' as NodeId, 'b' as NodeId, 'c-sat' as NodeId] }]
        const result = distributeOnTiers(center, satellites, tiers, 0)
        expect(result).toHaveLength(3)
        // 三个点在同一圆上
        for (const draft of result) {
            const d = distance(center.position, draft.position)
            expect(d).toBeCloseTo(10 + 5 + R0, 0) // D0 = centerRadius + maxSatR + R0
        }
    })
})

describe('distributeOnLine', () => {
    it('沿 x 轴等距排列', () => {
        const positions = distributeOnLine({ x: 0, y: 0 }, 0, 3, 100)
        expect(positions).toHaveLength(3)
        expect(positions[0]!.x).toBeCloseTo(100, 1)
        expect(positions[1]!.x).toBeCloseTo(200, 1)
        expect(positions[2]!.x).toBeCloseTo(300, 1)
    })
})

describe('scatterInCircle', () => {
    it('位置在圆内', () => {
        const center = { x: 0, y: 0 }
        const radius = 100
        for (let i = 0; i < 10; i++) {
            const pos = scatterInCircle(center, radius)
            expect(distance(center, pos)).toBeLessThanOrEqual(radius)
        }
    })
})

describe('computeTierSpacing', () => {
    it('D0 = centerRadius + maxSatR + R0', () => {
        const D0 = computeTierSpacing(10, [5, 3, 7])
        expect(D0).toBe(10 + 7 + R0)
    })

    it('空 radii 时默认 maxSatR = R0', () => {
        const D0 = computeTierSpacing(10, [])
        expect(D0).toBe(10 + R0 + R0)
    })
})
