/**
 * 图级操作（add_graph / delete_graph）逆向执行的唯一落点——undo 三段式的图级部分。
 *
 * @remarks
 * 正向兑现（add_graph 注册 / delete_graph 注销）已由引擎 applyBatches 接管（06.3 迁出），
 * 本文件仅保留逆向恢复函数供 undo 使用：
 * - revertAddGraph：add_graph 的逆元（整体注销）
 * - revertDeleteGraph：delete_graph 的逆元（从持久化完整恢复注册）
 *
 * 规则：
 * 1. delete_graph 为软删：正向只注销不触碰持久化（数据保留，
 *    逆元 revertDeleteGraph 才能 loadGraph 完整恢复）。
 * 2. revertAddGraph 与正向 delete_graph 动作相同（注销）——同一动作的两种
 *    语义身份（正向删图 vs 撤销建图），独立命名使调用点自解释。
 */

import type { GraphId } from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/graph_registry'
import { registerGraph, unregisterGraph } from '@/graph/graph_registry'

import { loadGraph } from '@/graph/graph_persistence'

import {
    reportCorruptedGraph,
    reportMissingGraph,
} from '@/graph/utils/data_integrity_reporter'

/**
 * add_graph 的逆元：整体注销（内容随图消失，不单独动图内数据）。
 *
 * @param registry - 图注册表
 * @param graphId - 要注销的图 ID
 */
export function revertAddGraph(
    registry: GraphRegistry,
    graphId: GraphId,
): void {
    unregisterGraph(registry, graphId)
}

/**
 * delete_graph 的逆元：从持久化完整恢复注册（软删保留的数据 + 注册）。
 *
 * @remarks
 * missing（图不存在）与 corrupted（图损坏）均走开发者通道（console.warn）并返回 false——
 * 调用方不中断流程（图级恢复失败不影响其余逆元执行）。
 *
 * @param registry - 图注册表
 * @param graphId - 要恢复的图 ID
 * @returns 恢复成功 true；missing / corrupted 返回 false。
 */
export function revertDeleteGraph(
    registry: GraphRegistry,
    graphId: GraphId,
): boolean {
    const result = loadGraph(graphId)

    if (!result.ok) {
        if (result.reason === 'corrupted') {
            reportCorruptedGraph(graphId, '图级恢复失败')
        } else {
            reportMissingGraph(graphId, '图级恢复失败')
        }
        return false
    }

    registerGraph(registry, result.graph)
    return true
}