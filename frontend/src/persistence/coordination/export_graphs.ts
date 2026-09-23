/**
 * 图数据导出：把一组图组装成带格式版本号的外部信封。
 *
 * @remarks
 * 本模块只产出数据对象，不触碰文件与 DOM —— 存储层不依赖浏览器 API，可脱离浏览器测试。
 * 文件 I/O 是用例层职责（`graph/use-case/export_graphs.ts`）。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { loadGraph, type ReadResult } from '../categories/graph_data'

/**
 * 导出信封的格式版本号。
 *
 * @remarks
 * 单调递增整数。未来加入操作日志等字段时只追加可选字段，不改既有字段名与类型。
 */
export type GraphExportFormatVersion = 1

/**
 * 图数据导出信封：一次导出落盘文件的完整内容。
 *
 * @remarks
 * 不含视图状态 —— 设备本地状态不随数据迁移。
 */
export interface GraphExportEnvelope {
    format: GraphExportFormatVersion
    graphs: GraphData[]
}

/**
 * 按 id 集合组装导出信封。
 *
 * @remarks
 * 逐 id 经 `categories/graph_data` 读出，不绕过类别层；任一 id 读取失败即整体失败，
 * 不静默跳过 —— 缺图的导出是不完整副本，比失败更危险。
 * graphs 顺序与传入 ids 顺序一致（调用方以此保证根图在首）。
 *
 * @param ids - 要导出的图 id（通常为某图谱树的全部成员）
 * @returns 成功 `{ ok: true, value: { format: 1, graphs } }`；任一 id 的读取失败原因
 *          （missing / corrupted / unavailable）原样向上传递。
 */
export function exportGraphs(ids: GraphId[]): ReadResult<GraphExportEnvelope> {
    const graphs: GraphData[] = []

    for (const id of ids) {
        const result = loadGraph(id)
        if (!result.ok) return result
        graphs.push(result.value)
    }

    return { ok: true, value: { format: 1, graphs } }
}
