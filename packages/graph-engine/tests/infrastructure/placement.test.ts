/**
 * placement.test.ts
 *
 * 六函数测试：positionOnCircle / snapOrbit / distributeOnTiers /
 * distributeOnLine / scatterInCircle / computeTierSpacing。
 */

import type { NodeId } from '../../src/types/graph_data'
import {
    positionOnCircle,
    snapOrbit,
    distributeOnTiers,
    distributeOnLine,
    scatterInCircle,
    computeTierSpacing,
} from '../../src/infrastructure/placement'
import { distance } from '../../src/infrastructure/geometry'
import { DEFAULT_LAYOUT_RULES } from '../../src/core/layout_rules'

const unitDistance = DEFAULT_LAYOUT_RULES.unitDistance

describe('positionOnCircle', () => {
    test('角度 0 时在 x 轴正方向', () => {
        const pos = positionOnCircle({ x: 0, y: 0 }, 100, 0)
        expect(pos.x).toBeCloseTo(100, 5)
        expect(pos.y).toBeCloseTo(0, 5)
    })

    test('角度 π/2 时在 y 轴正方向', () => {
        const pos = positionOnCircle({ x: 0, y: 0 }, 100, Math.PI / 2)
        expect(pos.x).toBeCloseTo(0, 5)
        expect(pos.y).toBeCloseTo(100, 5)
    })
})

describe('snapOrbit', () => {
    test('吸附至最近层级', () => {
        const center = { x: 0, y: 0 }
        // 距离 2.5 * unitDistance 的 cursor 应吸附至 tier 1 (轨道半径 = 2*unitDistance) 而非 tier 0 (半径=unitDistance)
        const cursor = { x: 2.5 * unitDistance, y: 0 }
        const snapped = snapOrbit(center, cursor, unitDistance, 3)
        expect(snapped.tier).toBe(1)
        const dist = distance(center, snapped.position)
        expect(dist).toBeCloseTo(2 * unitDistance, 0)
    })
})

describe('distributeOnTiers', () => {
    test('单层均分圆周', () => {
        const center = {
            id: 'c' as NodeId,
            position: { x: 0, y: 0 },
            radius: 10,
        }
        const satellites = [
            { id: 'a' as NodeId, radius: 5 },
            { id: 'b' as NodeId, radius: 5 },
            { id: 'c-sat' as NodeId, radius: 5 },
        ]
        const tiers = [
            {
                tier: 0,
                nodeIds: ['a' as NodeId, 'b' as NodeId, 'c-sat' as NodeId],
            },
        ]
        const result = distributeOnTiers(center, satellites, tiers, 0)
        expect(result).toHaveLength(3)
        // 三个点在同一圆上
        for (const draft of result) {
            const d = distance(center.position, draft.position)
            expect(d).toBeCloseTo(10 + 5 + unitDistance, 0) // D0 = centerRadius + maxSatR + unitDistance
        }
    })
})

describe('distributeOnLine', () => {
    test('沿 x 轴等距排列', () => {
        const positions = distributeOnLine({ x: 0, y: 0 }, 0, 3, 100)
        expect(positions).toHaveLength(3)
        expect(positions[0]!.x).toBeCloseTo(100, 1)
        expect(positions[1]!.x).toBeCloseTo(200, 1)
        expect(positions[2]!.x).toBeCloseTo(300, 1)
    })
})

describe('scatterInCircle', () => {
    test('位置在圆内', () => {
        const center = { x: 0, y: 0 }
        const radius = 100
        for (let i = 0; i < 10; i++) {
            const pos = scatterInCircle(center, radius)
            expect(distance(center, pos)).toBeLessThanOrEqual(radius)
        }
    })
})

describe('computeTierSpacing', () => {
    test('D0 = centerRadius + maxSatR + unitDistance', () => {
        const D0 = computeTierSpacing(10, [5, 3, 7])
        expect(D0).toBe(10 + 7 + unitDistance)
    })

    test('空 radii 时默认 maxSatR = unitDistance', () => {
        const D0 = computeTierSpacing(10, [])
        expect(D0).toBe(10 + unitDistance + unitDistance)
    })
})
