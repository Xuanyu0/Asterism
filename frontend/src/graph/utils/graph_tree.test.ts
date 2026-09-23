/**
 * graph_tree.test.ts
 *
 * 功能：
 *     图谱树域层纯函数 collectGraphTreeIds 的单元测试。
 *     覆盖多级子树收集、跨树隔离、环防御（自环 / 互环）、缺失根、介质不可用不静默。
 *
 * 规则：
 *     1. 只测域层函数，不涉及 store / 组件。
 *     2. 图数据经 commitGraphs 落盘（只序列化不校验），自环 / 互环等坏数据由此直接构造。
 *     3. 介质不可用经 mock 介质枚举构造。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { commitGraphs } from '@/persistence'
import * as medium from '@/persistence/medium/local_storage'

import { collectGraphTreeIds } from './graph_tree'

describe('collectGraphTreeIds', () => {
    beforeEach(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        medium.resetMediumForTests()
    })

    test('收集根图与全部后代（多级），根图在首', () => {
        commitGraphs({
            upserts: [
                makeGraph('r', '根图'),
                makeGraph('a', '子图A', 'r'),
                makeGraph('b', '子图B', 'a'),
                makeGraph('c', '子图C', 'a'),
            ],
            deletes: [],
        })

        const result = collectGraphTreeIds('r' as GraphId)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value[0]).toBe('r')
        expect(new Set(result.value)).toEqual(new Set(['r', 'a', 'b', 'c']))
    })

    test('不收集其他图谱树的图', () => {
        commitGraphs({
            upserts: [
                makeGraph('r', '根图'),
                makeGraph('a', '子图A', 'r'),
                makeGraph('other-root', '另一根图'),
                makeGraph('other-sub', '另一子图', 'other-root'),
            ],
            deletes: [],
        })

        const result = collectGraphTreeIds('r' as GraphId)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value).toEqual(['r', 'a'])
    })

    test('环防御：自环 / 互环坏数据不导致死循环，也不混入无关图', () => {
        commitGraphs({
            upserts: [
                makeGraph('r', '根图'),
                makeGraph('a', '子图A', 'r'),
                makeGraph('self', '自身为父', 'self'),
                makeGraph('x', '互环X', 'y'),
                makeGraph('y', '互环Y', 'x'),
            ],
            deletes: [],
        })

        const result = collectGraphTreeIds('r' as GraphId)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(new Set(result.value)).toEqual(new Set(['r', 'a']))
    })

    test('自环根：visited 防止同一图被重复入队（无 visited 会死循环）', () => {
        commitGraphs({
            upserts: [makeGraph('r', '根图', 'r'), makeGraph('a', '子图A', 'r')],
            deletes: [],
        })

        const result = collectGraphTreeIds('r' as GraphId)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(new Set(result.value)).toEqual(new Set(['r', 'a']))
    })

    test('根图不存在 → missing', () => {
        expect(collectGraphTreeIds('ghost' as GraphId)).toEqual({ ok: false, reason: 'missing' })
    })

    test('介质枚举失败 → unavailable（不冒充空结果）', () => {
        vi.spyOn(medium, 'listKeys').mockReturnValue({ ok: false, reason: 'unavailable' })

        expect(collectGraphTreeIds('r' as GraphId)).toEqual({ ok: false, reason: 'unavailable' })
    })

    test('索引构建阶段任一图读取失败 → 整体失败，不静默跳过（否则导出不完整却报成功）', () => {
        commitGraphs({
            upserts: [makeGraph('r', '根图'), makeGraph('a', '中间子图', 'r'), makeGraph('b', '深层子图', 'a')],
            deletes: [],
        })

        // 把中间图 'a' 的读取伪造成损坏：若遍历静默跳过它，'b' 会整支从可达域消失
        const realReadString = medium.readString
        vi.spyOn(medium, 'readString').mockImplementation((key: string) => {
            if (key === 'graph:a') return { ok: true, value: '{ 损坏的 JSON' }
            return realReadString(key)
        })

        expect(collectGraphTreeIds('r' as GraphId)).toEqual({ ok: false, reason: 'corrupted' })
    })
})

function makeGraph(id: string, title: string, parentGraphId?: string): GraphData {
    return {
        id: id as GraphId,
        kind: parentGraphId === undefined ? 'root' : 'subgraph',
        title,
        parentGraphId: parentGraphId as GraphId | undefined,
        nodes: [],
        edges: [],
        cognitiveState: { foldedDependencies: [] },
    }
}
