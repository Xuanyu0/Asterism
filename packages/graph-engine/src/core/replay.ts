/**
 * replay.ts
 *
 * 功能：
 *     操作序列回放。给定基线 GraphData + 操作序列，重建任意历史状态。
 *
 * 总体结构：
 *     1. replayGraph — 回放到末尾
 *     2. replayToStep — 回放到指定步数
 *
 * 规则：
 *     1. 纯函数，不修改入参。
 *     2. 从基线图逐步 apply 操作，不依赖外部状态。
 *
 * 外部如何使用：
 *     import { replayGraph, replayToStep } from '@my-project/graph-engine'
 */

import type { GraphData } from '../types/graph_data'
import type { GraphOperation } from '../types/operations'
import { executeOperation } from './execute'

/**
 * 功能：
 *     从基线 GraphData + 操作序列回放到末尾。
 *
 * 使用：
 *     历史回溯：从最近的基线快照重建当前状态。
 */
export function replayGraph(baseGraph: GraphData, operations: GraphOperation[]): GraphData {
    return operations.reduce((graph, op) => executeOperation(graph, op), baseGraph)
}

/**
 * 功能：
 *     从基线 GraphData + 操作序列回放到指定步数。
 *
 * 规则：
 *     step = k 表示应用 operations[0..k-1]，返回 $G_k$。
 *     step = 0 返回基线图而不应用任何操作。
 *
 * 使用：
 *     历史浏览：临时 fork 出中间状态供只读查看，不修改当前 GraphData。
 */
export function replayToStep(baseGraph: GraphData, operations: GraphOperation[], step: number): GraphData {
    const clampedStep = Math.max(0, Math.min(step, operations.length))

    return operations.slice(0, clampedStep).reduce((graph, op) => executeOperation(graph, op), baseGraph)
}
