/**
 * 说明：
 *
 *     图级操作（add_graph / delete_graph）正/逆向执行的唯一落点——
 *     统一对称撤销模型的图级部分（图内部分由引擎 createReversal / applyBatch 处理）：
 *
 *                   正向（commitBatchToGraphs 第三阶段 / redo）  逆元（undo）
 *        add_graph    applyAddGraph（注册）                    revertAddGraph（整体注销）
 *        delete_graph applyDeleteGraph（注销，软删）           revertDeleteGraph（完整恢复注册）
 *
 * 规则：
 *
 *     1. delete_graph 为软删：正向只注销不触碰持久化（数据保留，
 *        逆元 revertDeleteGraph 才能 loadGraph 完整恢复）。
 *     2. revertAddGraph 与 applyDeleteGraph 动作相同（注销）——同一动作的两种
 *        语义身份（正向删图 vs 撤销建图），独立命名使调用点自解释。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/graph_registry'
import { registerGraph, unregisterGraph } from '@/graph/graph_registry'

import { loadGraph } from '@/graph/graph_persistence'

import { reportCorruptedGraph, reportMissingGraph } from '@/graph/utils/data_integrity_reporter'

/**
 * 说明：
 *
 *     add_graph 正向执行：注册新图（applyBatch 执行后的结果图）。
 *
 * 参数：
 *
 *     registry — 图注册表
 *     graph    — 要注册的图
 */
export function applyAddGraph(registry: GraphRegistry, graph: GraphData): void {
    registerGraph(registry, graph)
}

/**
 * 说明：
 *
 *     delete_graph 正向执行：注销图（软删，不触碰持久化）。
 *
 * 参数：
 *
 *     registry — 图注册表
 *     graphId  — 要注销的图 ID
 */
export function applyDeleteGraph(registry: GraphRegistry, graphId: GraphId): void {
    unregisterGraph(registry, graphId)
}

/**
 * 说明：
 *
 *     add_graph 的逆元：整体注销（内容随图消失，不单独动图内数据）。
 *
 * 参数：
 *
 *     registry — 图注册表
 *     graphId  — 要注销的图 ID
 */
export function revertAddGraph(registry: GraphRegistry, graphId: GraphId): void {
    unregisterGraph(registry, graphId)
}

/**
 * 说明：
 *
 *     delete_graph 的逆元：从持久化完整恢复注册（软删保留的数据 + 注册）。
 *
 * 规则：
 *
 *     1. missing（图不存在）与 corrupted（图损坏）均走开发者通道
 *        （console.warn，经 utils/data_integrity_reporter 统一报告）并返回 false——
 *        调用方不中断流程（图级恢复失败不影响其余逆元执行）。
 *
 * 参数：
 *
 *     registry — 图注册表
 *     graphId  — 要恢复的图 ID
 *
 * 返回：
 *
 *     恢复成功 true；missing / corrupted 返回 false。
 */
export function revertDeleteGraph(registry: GraphRegistry, graphId: GraphId): boolean {
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
