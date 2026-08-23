/**
 * 操作序列回放：给定基线 GraphData + 操作序列，重建任意历史状态。
 *
 * @remarks
 * 纯函数，不修改入参；从基线图逐步 apply 操作，不依赖外部状态。
 */

import type { GraphData } from '../types/graph_data'
import type { AtomicOperationInGraph } from '../types/atomic_operations'
import { executeOperation } from './execute_operation'

/**
 * 从基线 GraphData + 操作序列回放到末尾。
 *
 * @param baseGraph - 基线图
 * @param operations - 按序回放的操作序列
 * @returns 回放后的图。
 */
export function replayGraph(
    baseGraph: GraphData,
    operations: AtomicOperationInGraph[],
): GraphData {
    return operations.reduce(
        (graph, op) => executeOperation(graph, op),
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
 * @returns 回放到第 step 步的图。
 */
export function replayToStep(
    baseGraph: GraphData,
    operations: AtomicOperationInGraph[],
    step: number,
): GraphData {
    const clampedStep = Math.max(0, Math.min(step, operations.length))

    return operations
        .slice(0, clampedStep)
        .reduce((graph, op) => executeOperation(graph, op), baseGraph)
}
