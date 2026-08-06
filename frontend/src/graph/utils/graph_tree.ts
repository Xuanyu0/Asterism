/**
 * 说明：
 *
 *     图谱树归属判定纯函数工具。沿 parentGraphId 链回溯，
 *     判断给定图是否属于指定根图树。
 *
 * 调用契约：
 *
 *     1. 只读持久化与传入参数，不持有任何状态。
 *     2. 供 graph_store.initRegistry（预加载子图）与导航适配层
 *        deleteRootGraphTree（级联删除树成员收集）共用。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { loadGraph } from '@/graph/graph_persistence'

/**
 * 说明：
 *
 *     沿 parentGraphId 链回溯，判断 graph 是否属于指定根图树。
 *
 * 规则：
 *
 *     1. 祖先图从持久化惰性加载；环检测防止异常数据导致无限循环。
 *
 * 参数：
 *
 *     graph  — 待判定归属的图
 *     rootId — 根图 ID
 */
export function isInRootTree(graph: GraphData, rootId: GraphId): boolean {
    if (graph.id === rootId) return true

    let current = graph
    const visited = new Set<GraphId>([graph.id])
    while (current.parentGraphId) {
        if (current.parentGraphId === rootId) return true
        if (visited.has(current.parentGraphId)) return false  // 环检测
        visited.add(current.parentGraphId)

        const parent = loadGraph(current.parentGraphId)
        if (!parent) return false

        current = parent
    }
    return false  // 抵达某根图（parentGraphId === undefined），但不是我们的根图
}
