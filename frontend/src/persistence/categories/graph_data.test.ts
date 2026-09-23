/**
 * categories/graph_data.test.ts
 *
 * 功能：
 *     图数据类别 loadGraph 判别联合分支的单元测试（迁移自旧持久化测试）。
 *     覆盖 missing / corrupted / ok 三分支的信号区分、介质不可用不静默、以及 commitGraphs 的写 / 删路径。
 *
 * 规则：
 *     1. 只测图数据类别与批量提交，不涉及 store 状态。
 *     2. corrupted 分支经介质直接写入非法 JSON 构造——绕过类别序列化，模拟磁盘损坏。
 *     3. 介质不可用经 mock 介质枚举 / 底层存储访问抛异常构造。
 *     4. 半写态用例把「P1 不保证磁盘原子性」固化为事实，防后人误以为已有事务语义——
 *        断言重心是「已写条目留在磁盘」，不是「应当回滚」。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { commitGraphs, listGraphIds, listRootGraphIds, loadGraph } from '@/persistence'
import * as medium from '@/persistence/medium/local_storage'

describe('loadGraph 判别联合', () => {
    beforeEach(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    afterAll(() => {
        medium.resetMediumForTests()
    })

    test('missing 分支：key 不存在 → { ok: false, reason: "missing" }', () => {
        expect(loadGraph('graph-nonexistent' as GraphId)).toEqual({ ok: false, reason: 'missing' })
    })

    test('corrupted 分支：key 存在但 JSON 非法 → { ok: false, reason: "corrupted" }', () => {
        medium.writeString('graph:graph-corrupt', 'not-valid-json{{{')

        expect(loadGraph('graph-corrupt' as GraphId)).toEqual({ ok: false, reason: 'corrupted' })
    })

    test('ok 分支：合法数据 → { ok: true, value } 且与保存数据一致', () => {
        const graph = makeGraph('graph-ok', '判别联合测试图')
        commitGraphs({ upserts: [graph], deletes: [] })

        expect(loadGraph('graph-ok' as GraphId)).toEqual({ ok: true, value: graph })
    })
})

describe('commitGraphs', () => {
    beforeEach(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    test('upserts 写入、deletes 删除，listGraphIds 随之可见 / 消失', () => {
        const graph = makeGraph('graph-ok', '写删测试图')

        commitGraphs({ upserts: [graph], deletes: [] })
        expect(listGraphIds()).toEqual({ ok: true, value: ['graph-ok'] })

        commitGraphs({ upserts: [], deletes: ['graph-ok' as GraphId] })
        expect(loadGraph('graph-ok' as GraphId)).toEqual({ ok: false, reason: 'missing' })
    })

    test('介质写失败 → 原样回报失败（不吞异常、不改写为成功）', () => {
        vi.spyOn(medium, 'writeString').mockReturnValue({ ok: false, reason: 'quota-exceeded' })

        expect(commitGraphs({ upserts: [makeGraph('graph-ok', '写失败图')], deletes: [] })).toEqual({
            ok: false,
            reason: 'quota-exceeded',
        })
    })

    test('有害子情形：第 1 条落盘、第 2 条失败 → 返回失败，但第 1 条已在磁盘（P1 无事务）', () => {
        const first = makeGraph('graph-first', '第一条图')
        const second = makeGraph('graph-second', '第二条图')

        const realWriteString = medium.writeString
        let writeCount = 0
        vi.spyOn(medium, 'writeString').mockImplementation((key, value) => {
            writeCount += 1
            return writeCount === 1 ? realWriteString(key, value) : { ok: false, reason: 'quota-exceeded' }
        })

        expect(commitGraphs({ upserts: [first, second], deletes: [] })).toEqual({
            ok: false,
            reason: 'quota-exceeded',
        })

        // 第 1 条已落盘且不会被撤销：磁盘停在半写态，这就是 P1 的事实边界
        expect(loadGraph('graph-first' as GraphId)).toEqual({ ok: true, value: first })
    })

    test('listRootGraphIds 只返回 kind === "root" 的图', () => {
        const root = makeGraph('graph-root-test', '根图')
        const sub: GraphData = {
            id: 'graph-sub-test' as GraphId,
            kind: 'subgraph',
            title: '子图',
            parentGraphId: 'graph-root-test' as GraphId,
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        }

        commitGraphs({ upserts: [root, sub], deletes: [] })

        expect(listRootGraphIds()).toEqual({ ok: true, value: ['graph-root-test'] })
    })
})

describe('介质不可用不静默', () => {
    beforeEach(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    test('listKeys：枚举抛异常 → unavailable（不吞异常、不返回空数组）', () => {
        medium.writeString('graph:graph-ok', '{}') // 保证 length > 0，循环进入 key(i)
        vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
            throw new DOMException('storage disabled', 'SecurityError')
        })

        expect(medium.listKeys()).toEqual({ ok: false, reason: 'unavailable' })
    })

    test('listGraphIds / listRootGraphIds：枚举失败向上报 unavailable，不冒充空结果', () => {
        vi.spyOn(medium, 'listKeys').mockReturnValue({ ok: false, reason: 'unavailable' })

        expect(listGraphIds()).toEqual({ ok: false, reason: 'unavailable' })
        expect(listRootGraphIds()).toEqual({ ok: false, reason: 'unavailable' })
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
