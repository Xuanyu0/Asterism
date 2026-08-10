/**
 * 说明：
 *
 *     数据完整性异常的开发者通道报告（console.warn，用户默认不可见）统一落点。
 *     所有报告以 DATA_INTEGRITY_PREFIX 开头，便于在 console 中过滤检索。
 *     供 graph_store（图加载 / 回溯链异常）与 graph_signals（图级恢复异常）共用，
 *     避免各模块重复定义前缀常量与损坏 / 缺失报告文案。
 */

import type { GraphId } from '@my-project/graph-engine'

/** 开发者通道统一前缀。所有数据完整性异常报告以此开头，便于在 console 中过滤检索。 */
export const DATA_INTEGRITY_PREFIX = '[data-integrity]'

/**
 * 说明：
 *
 *     数据损坏报告（开发者通道）。持久化图谱 JSON 反序列化失败（corrupted）时调用。
 *
 * 参数：
 *
 *     graphId — 损坏图谱的 ID（报告中的 targetId）
 *     context — [可选] 报告场景补充说明（如 '已跳过加载' / '图级恢复失败'）
 */
export function reportCorruptedGraph(graphId: GraphId, context?: string): void {
    const suffix = context ? `，${context}` : ''
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [CORRUPTED_GRAPH] 图谱 "${graphId}" 持久化数据损坏（JSON 解析失败）${suffix}`,
    )
}

/**
 * 说明：
 *
 *     图缺失报告（开发者通道）。从持久化加载图不存在（missing）时调用。
 *
 * 参数：
 *
 *     graphId — 缺失图谱的 ID
 *     context — [可选] 报告场景补充说明（如 '图级恢复失败'）
 */
export function reportMissingGraph(graphId: GraphId, context?: string): void {
    const suffix = context ? `，${context}` : ''
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [GRAPH_MISSING] 图谱 "${graphId}" 不存在于持久化${suffix}`,
    )
}
