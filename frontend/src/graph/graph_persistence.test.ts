/**
 * graph_persistence.test.ts
 *
 * 功能：
 *     graph_persistence 层 loadGraph 判别联合分支的单元测试（08.3 补全）。
 *     覆盖 missing / corrupted / ok 三分支的信号区分。
 *
 * 规则：
 *     1. 本文件只测持久化原语，不涉及 store 状态。
 *     2. corrupted 分支通过直接写入非法 JSON 到 localStorage 构造。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { saveGraph, loadGraph } from '@/graph/graph_persistence'

describe('graph_persistence loadGraph 判别联合（08.3）', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    afterAll(() => {
        localStorage.clear()
    })

    test('missing 分支：key 不存在 → { ok: false, reason: "missing" }', () => {
        const result = loadGraph('graph-nonexistent' as GraphId)

        expect(result).toEqual({ ok: false, reason: 'missing' })
    })

    test('corrupted 分支：key 存在但 JSON 非法 → { ok: false, reason: "corrupted" }', () => {
        localStorage.setItem('graph:graph-corrupt', 'not-valid-json{{{')

        const result = loadGraph('graph-corrupt' as GraphId)

        expect(result).toEqual({ ok: false, reason: 'corrupted' })
    })

    test('ok 分支：合法数据 → { ok: true, graph } 且与保存数据一致', () => {
        const graph: GraphData = {
            id: 'graph-ok' as GraphId,
            kind: 'root',
            title: '判别联合测试图',
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        }
        saveGraph(graph)

        const result = loadGraph('graph-ok' as GraphId)

        expect(result).toEqual({ ok: true, graph })
    })
})
