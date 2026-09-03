/**
 * 操作序列回放：给定基线 GraphData + 操作序列，重建任意历史状态。
 *
 * @remarks
 * 纯函数，不修改入参；从基线图逐步 apply 操作，不依赖外部状态。
 *
 * 时间戳语义 = 重放时刻（按当前时刻如实记录），历史时间戳由 undo 经逆元快照恢复。
 * executedAt 缺省时内部兜底生成——回放场景调用方无需指定时间源。
 */

import type { GraphData } from '../types/graph_data'
import type { AtomicOperationInGraph } from '../types/atomic_operations'
import { executeOperation } from './execute_operation'

/**
 * 从基线 GraphData + 操作序列回放到末尾。
 *
 * @param baseGraph - 基线图
 * @param operations - 按序回放的操作序列
 * @param executedAt - [可选] 回放时刻时间戳，缺省内部生成
 * @returns 回放后的图。
 */
export function replayGraph(
    baseGraph: GraphData,
    operations: AtomicOperationInGraph[],
    executedAt?: string,
): GraphData {
    const effectiveExecutedAt = executedAt ?? new Date().toISOString()

    return operations.reduce(
        (graph, op) => executeOperation(graph, op, effectiveExecutedAt),
        baseGraph,
    )
}

/**
 * 从基线 GraphData + 操作序列回放到指定步数。
 *
 * @remarks
 * step = k 表示应用 operations[0..k-1]，返回 $G_k$；step = 0 返回基线图而不应用任何操作。
 *
 * @param baseGraph - 基线图
 * @param operations - 按序回放的操作序列
 * @param step - 回放步数（越界自动钳制到 [0, operations.length]）
 * @param executedAt - [可选] 回放时刻时间戳，缺省内部生成
 * @returns 回放到第 step 步的图。
 */
export function replayToStep(
    baseGraph: GraphData,
    operations: AtomicOperationInGraph[],
    step: number,
    executedAt?: string,
): GraphData {
    const clampedStep = Math.max(0, Math.min(step, operations.length))
    const effectiveExecutedAt = executedAt ?? new Date().toISOString()

    return operations
        .slice(0, clampedStep)
        .reduce(
            (graph, op) => executeOperation(graph, op, effectiveExecutedAt),
            baseGraph,
        )
}
