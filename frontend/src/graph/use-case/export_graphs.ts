/**
 * 图数据导出用例层模块级单例。
 *
 * @remarks
 * 编排「根图谱 → 下载文件」：子树遍历（域层）→ 组装信封（持久化层）→ 序列化 → 触发浏览器下载。
 * 文件 I/O（Blob / URL.createObjectURL / <a download>）只落在本层 —— 持久化层保持可脱离浏览器测试。
 * 与 useNavigation / useGraphOperation 同风格：懒创建，后续调用返回同一实例。
 */

import type { GraphId } from '@my-project/graph-engine'

import { exportGraphs, loadGraph } from '@/persistence'
import { collectGraphTreeIds } from '@/graph/utils/graph_tree'

/**
 * 图谱树导出的结果。
 *
 * @remarks
 * 失败原因：
 * - unavailable：持久化介质不可用，读不到图数据
 * - unknown：其余读取失败（目标根图缺失 / 损坏）
 */
export type ExportResult = { ok: true } | { ok: false; reason: 'unavailable' | 'unknown' }

/**
 * useGraphExport 返回的导出用例层 API。
 */
export interface GraphExportAPI {
    /**
     * 导出以 rootId 为首的整棵图谱树为 JSON 文件。
     *
     * @remarks
     * 流程：校验根图存在并取标题 → 收集整棵树 id → 组装信封 → 序列化 → 触发下载。
     * 文件名 = `asterism-<根图标题>.json`，标题中的文件系统非法字符替换为 `-`。
     *
     * @param rootId - 要导出的根图 id
     * @returns 下载已触发 `{ ok: true }`；失败 `{ ok: false, reason }`（不抛异常）。
     */
    exportGraphTree(rootId: GraphId): ExportResult
}

let singleton: GraphExportAPI | null = null

/**
 * 获取导出用例层模块级单例（懒创建）。
 */
export function useGraphExport(): GraphExportAPI {
    if (!singleton) {
        singleton = createGraphExport()
    }
    return singleton
}

function createGraphExport(): GraphExportAPI {
    function exportGraphTree(rootId: GraphId): ExportResult {
        // 先取根图：标题用于文件名，同时兜住根图缺失 / 损坏（子树遍历对缺失根返回 missing）
        const root = loadGraph(rootId)
        if (!root.ok) {
            return toExportFailure(root.reason)
        }

        const treeIds = collectGraphTreeIds(rootId)
        if (!treeIds.ok) {
            return toExportFailure(treeIds.reason)
        }

        const envelope = exportGraphs(treeIds.value)
        if (!envelope.ok) {
            return toExportFailure(envelope.reason)
        }

        return downloadJsonFile(buildExportFileName(root.value.title), JSON.stringify(envelope.value))
    }

    return { exportGraphTree }
}

// ── 私有辅助（失败归因） ──

/**
 * 把持久化读取失败归因为导出失败：介质不可用原样保留，missing / corrupted 一律归为 unknown。
 */
function toExportFailure(readReason: 'missing' | 'corrupted' | 'unavailable'): ExportResult {
    return { ok: false, reason: readReason === 'unavailable' ? 'unavailable' : 'unknown' }
}

// ── 私有辅助（文件下载） ──

/**
 * 触发浏览器下载一段 JSON 文本。
 *
 * @remarks
 * 三条可靠性约定（均为验证阶段回流补强）：
 *
 * 1. `<a>` **先挂载到 document 再 click，之后移除** —— 属**历史防御性写法**：旧 Firefox / IE 对
 *    未挂载元素调 `click()` 不触发默认动作。现代浏览器（Chrome / Firefox / Safari / Edge）对未挂载
 *    anchor 调 `click()` 同样生效，挂载**非必需**；此处保留仅为兼容旧环境。
 * 2. **revoke 必须延后**：下载管线是**异步取 Blob** 的，`click()` 后同步 revoke 会让部分浏览器
 *    **静默取消下载且不抛错**（Firefox bug 1282407 及多方同类报告）。仍须 revoke，否则对象 URL
 *    会钉住 Blob 阻止 GC —— 浏览器仅在文档卸载时统一释放，而 SPA 从不卸载，等于泄漏到 tab 关闭。
 * 3. **任一环节抛出都归为 `unknown` 失败**，不得穿到调用方 —— 否则用户得不到任何反馈。
 *
 * @returns 下载请求已触发 `{ ok: true }`；任一环节抛出 `{ ok: false, reason: 'unknown' }`。
 */
function downloadJsonFile(fileName: string, json: string): ExportResult {
    let objectUrl: string | null = null
    try {
        const blob = new Blob([json], { type: 'application/json' })
        objectUrl = URL.createObjectURL(blob)

        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = fileName
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()

        return { ok: true }
    } catch {
        return { ok: false, reason: 'unknown' }
    } finally {
        if (objectUrl !== null) {
            const urlToRevoke = objectUrl
            // 延后 revoke：见 @remarks 第 2 条（同步 revoke 会导致下载被静默取消）
            setTimeout(() => URL.revokeObjectURL(urlToRevoke), 0)
        }
    }
}

/** 文件系统非法字符：Windows 与 POSIX 的并集。 */
const ILLEGAL_FILE_NAME_CHARS = /[/\\:*?"<>|]/g

/**
 * 由根图标题生成导出文件名：`asterism-<标题>.json`。
 *
 * @remarks
 * 标题中的非法字符替换为 `-`，保证下载目录里可读且跨平台可写。
 */
function buildExportFileName(rootTitle: string): string {
    return `asterism-${rootTitle.replace(ILLEGAL_FILE_NAME_CHARS, '-')}.json`
}
