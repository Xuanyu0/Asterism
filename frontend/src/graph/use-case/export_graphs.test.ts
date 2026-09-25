/**
 * use-case/export_graphs.test.ts
 *
 * 功能：
 *     导出用例层 exportGraphTree 的单元测试。
 *     覆盖文件名生成（含非法字符替换）、下载内容为信封、【延后】revoke、
 *     下载环节抛出归为 unknown、以及树成员收集的失败归因
 *     （介质枚举不可用 → unavailable；根图缺失 / 损坏、任一图损坏、根图可读却枚举不到 → unknown）。
 *
 * 规则：
 *     1. jsdom 无 URL.createObjectURL —— 用例经 mock 注入，捕获 Blob 与 revoke 调用。
 *     2. anchor.click 经 spy 拦截，避免 jsdom 对 blob: URL 的导航未实现告警。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { commitGraphs } from '@/persistence'
import * as medium from '@/persistence/medium/local_storage'

import { useGraphExport } from './export_graphs'

describe('useGraphExport', () => {
    let clicked: HTMLAnchorElement[]
    let blobs: Blob[]
    let revokeObjectURL: ReturnType<typeof vi.fn>

    beforeEach(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()

        clicked = []
        blobs = []
        URL.createObjectURL = vi.fn((blob: Blob) => {
            blobs.push(blob)
            return 'blob:mock-url'
        }) as unknown as typeof URL.createObjectURL
        revokeObjectURL = vi.fn()
        URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push(this)
        })
    })

    afterAll(() => {
        medium.resetMediumForTests()
        vi.restoreAllMocks()
    })

    test('导出图谱树：文件名按标题、内容为信封、click 后【延后】revoke 对象 URL', async () => {
        commitGraphs({
            upserts: [makeGraph('r', '金牌测试图'), makeGraph('a', '子图', 'r')],
            deletes: [],
        })

        const result = useGraphExport().exportGraphTree('r' as GraphId)
        expect(result).toEqual({ ok: true })

        expect(clicked).toHaveLength(1)
        expect(clicked[0]?.download).toBe('asterism-金牌测试图.json')
        // revoke 必须【延后】：同步 revoke 会让部分浏览器静默取消下载（见 downloadJsonFile 注释）
        expect(revokeObjectURL).not.toHaveBeenCalled()
        await flushMacrotask()
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

        const text = await readBlobText(blobs[0]!)
        const envelope = JSON.parse(text) as { format: number; graphs: Array<{ id: string }> }
        expect(envelope.format).toBe(1)
        expect(envelope.graphs.map((graph) => graph.id)).toEqual(['r', 'a'])
    })

    test('下载环节抛出 → 归为 unknown，不穿到调用方', () => {
        commitGraphs({ upserts: [makeGraph('r', '根图')], deletes: [] })
        URL.createObjectURL = vi.fn(() => {
            throw new Error('boom')
        }) as unknown as typeof URL.createObjectURL

        expect(useGraphExport().exportGraphTree('r' as GraphId)).toEqual({ ok: false, reason: 'unknown' })
        expect(clicked).toHaveLength(0)
    })

    test('标题中的文件系统非法字符替换为 -', async () => {
        commitGraphs({ upserts: [makeGraph('r', 'a/b:c*d?e"f<g>h|i\\j')], deletes: [] })

        useGraphExport().exportGraphTree('r' as GraphId)

        expect(clicked[0]?.download).toBe('asterism-a-b-c-d-e-f-g-h-i-j.json')
        await flushMacrotask() // 清掉本用例排队的延后 revoke，避免漏到下个用例
    })

    test('根图不存在 → unknown，不触发下载', () => {
        expect(useGraphExport().exportGraphTree('ghost' as GraphId)).toEqual({ ok: false, reason: 'unknown' })
        expect(clicked).toHaveLength(0)
        expect(revokeObjectURL).not.toHaveBeenCalled()
    })

    test('介质不可用 → unavailable', () => {
        vi.spyOn(medium, 'readString').mockReturnValue({ ok: false, reason: 'unavailable' })

        expect(useGraphExport().exportGraphTree('r' as GraphId)).toEqual({ ok: false, reason: 'unavailable' })
    })

    test('介质枚举失败（根图可读）→ unavailable，不冒充空结果', () => {
        commitGraphs({ upserts: [makeGraph('r', '根图')], deletes: [] })
        vi.spyOn(medium, 'listKeys').mockReturnValue({ ok: false, reason: 'unavailable' })

        expect(useGraphExport().exportGraphTree('r' as GraphId)).toEqual({ ok: false, reason: 'unavailable' })
    })

    test('根图可读但枚举不到 → unknown（不得退回「只导根图」的静默不完整导出）', () => {
        commitGraphs({
            upserts: [makeGraph('r', '根图'), makeGraph('a', '子图', 'r')],
            deletes: [],
        })
        // 模拟介质「可读却不可枚举」：读取真实、枚举为空 —— 跨通道假设不成立
        vi.spyOn(medium, 'listKeys').mockReturnValue({ ok: true, value: [] })

        expect(useGraphExport().exportGraphTree('r' as GraphId)).toEqual({ ok: false, reason: 'unknown' })
        expect(clicked).toHaveLength(0)
    })

    test('根图损坏 → unknown', () => {
        commitGraphs({ upserts: [makeGraph('r', '根图')], deletes: [] })
        corruptGraphRead('graph:r')

        expect(useGraphExport().exportGraphTree('r' as GraphId)).toEqual({ ok: false, reason: 'unknown' })
    })

    test('非根图损坏 → unknown（索引构建任一图读不到整体失败，不静默跳过）', () => {
        commitGraphs({
            upserts: [makeGraph('r', '根图'), makeGraph('a', '中间子图', 'r'), makeGraph('b', '深层子图', 'a')],
            deletes: [],
        })
        // 把中间图 'a' 的读取伪造成损坏：若遍历静默跳过它，'b' 会整支从可达域消失
        corruptGraphRead('graph:a')

        expect(useGraphExport().exportGraphTree('r' as GraphId)).toEqual({ ok: false, reason: 'unknown' })
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

/** 把某个 graph key 的读取伪造成损坏（其余 key 走真实介质）。 */
function corruptGraphRead(key: string): void {
    const realReadString = medium.readString
    vi.spyOn(medium, 'readString').mockImplementation((storageKey: string) => {
        if (storageKey === key) return { ok: true, value: '{ 损坏的 JSON' }
        return realReadString(storageKey)
    })
}

/** jsdom 的 Blob 无 text()，经 FileReader 读取内容。 */
function readBlobText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(blob)
    })
}

/** 让出一个宏任务，使 downloadJsonFile 排队的【延后 revoke】得以执行。 */
function flushMacrotask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}
