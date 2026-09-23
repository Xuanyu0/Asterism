/**
 * coordination/export_graphs.test.ts
 *
 * 功能：
 *     exportGraphs 信封组装与失败传播的单元测试。
 *     覆盖 format 版本号、graphs 内容与顺序、按 id 集合精确取图、
 *     missing / corrupted / unavailable 传播、空集合。
 *
 * 规则：
 *     1. 只测数据层，不涉及 store / DOM（本模块不依赖 Blob / URL）。
 *     2. corrupted 经介质直接写入非法 JSON 构造，绕过类别序列化。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { commitGraphs, exportGraphs } from '@/persistence'
import * as medium from '@/persistence/medium/local_storage'

describe('exportGraphs', () => {
    beforeEach(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        medium.resetMediumForTests()
    })

    test('信封形状：format === 1，graphs 内容与传入 id 顺序一致', () => {
        const a = makeGraph('a', '图A')
        const b = makeGraph('b', '图B')
        commitGraphs({ upserts: [a, b], deletes: [] })

        const result = exportGraphs(['b', 'a'] as GraphId[])
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value.format).toBe(1)
        expect(result.value.graphs).toEqual([b, a])
    })

    test('按 id 集合精确取图：不在集合内的图不进入信封', () => {
        commitGraphs({ upserts: [makeGraph('a', '图A'), makeGraph('b', '图B')], deletes: [] })

        const result = exportGraphs(['a'] as GraphId[])
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value.graphs.map((graph) => graph.id)).toEqual(['a'])
    })

    test('id 缺失 → missing（不静默跳过，不产出不完整信封）', () => {
        commitGraphs({ upserts: [makeGraph('a', '图A')], deletes: [] })

        expect(exportGraphs(['a', 'ghost'] as GraphId[])).toEqual({ ok: false, reason: 'missing' })
    })

    test('数据损坏 → corrupted', () => {
        medium.writeString('graph:broken', 'not-valid-json{{{')

        expect(exportGraphs(['broken'] as GraphId[])).toEqual({ ok: false, reason: 'corrupted' })
    })

    test('介质不可用 → unavailable', () => {
        vi.spyOn(medium, 'readString').mockReturnValue({ ok: false, reason: 'unavailable' })

        expect(exportGraphs(['a'] as GraphId[])).toEqual({ ok: false, reason: 'unavailable' })
    })

    test('空 id 集合 → 空 graphs 信封', () => {
        expect(exportGraphs([])).toEqual({ ok: true, value: { format: 1, graphs: [] } })
    })
})

function makeGraph(id: string, title: string): GraphData {
    return {
        id: id as GraphId,
        kind: 'root',
        title,
        nodes: [],
        edges: [],
        cognitiveState: { foldedDependencies: [] },
    }
}
