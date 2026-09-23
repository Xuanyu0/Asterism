/**
 * 说明：
 *
 *     数据完整性异常的开发者通道报告（console.warn，用户默认不可见）统一落点。
 *     所有报告以 DATA_INTEGRITY_PREFIX 开头，便于在 console 中过滤检索。
 *     供 graph_store（图加载 / 回溯链异常）共用，避免各模块重复定义前缀常量与报告文案。
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
 * 持久化介质不可用报告（开发者通道）。介质枚举失败、无法列出图谱时调用。
 *
 * @remarks
 * 「介质不可用」与「没有数据」必须可区分：调用方据本报告中止流程，
 * 不得把读不到降级为空结果（用户会以为数据丢失）。
 *
 * @param context - 报告场景（调用方函数名）
 */
export function reportStorageUnavailable(context: string): void {
    console.warn(`${DATA_INTEGRITY_PREFIX} [STORAGE_UNAVAILABLE] ${context}：持久化介质不可用，无法枚举图谱`)
}
