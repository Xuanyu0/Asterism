/**
 * 图谱树归属判定与树成员收集的工具。
 *
 * @remarks
 * 本模块不持有状态：
 * - {@link isInGraphTree}：沿 parentGraphId 向上回溯的树归属判定（祖先图从持久化惰性加载）。
 * - {@link collectDescendantIds}：向下的树成员收集纯算法 —— 数据源与失败策略由调用方负责，
 *   本函数不碰 I/O、无失败通道。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { loadGraph } from '@/persistence'

/**
 * 沿 parentGraphId 链回溯，判断 graph 是否属于指定图谱树。
 *
 * @remarks
 * 祖先图从持久化惰性加载；环检测防止异常数据导致无限循环。
 * 供导航用例层 deleteGraphTree（级联删除树成员收集）使用。
 *
 * @param graph - 待判定归属的图
 * @param rootId - 根图 ID
 * @returns graph 自身或任一祖先图等于 rootId 时为 true。
 */
export function isInGraphTree(graph: GraphData, rootId: GraphId): boolean {
    if (graph.id === rootId) return true

    let current = graph
    const visited = new Set<GraphId>([graph.id])
    while (current.parentGraphId) {
        if (current.parentGraphId === rootId) return true
        if (visited.has(current.parentGraphId)) return false // 环检测
        visited.add(current.parentGraphId)

        const result = loadGraph(current.parentGraphId)
        if (!result.ok) return false

        current = result.value
    }
    return false // 抵达某根图（parentGraphId === undefined），但不是我们的根图
}

/**
 * 从 rootId 起做 BFS，收集自身与全部后代的图 id。
 *
 * @remarks
 * 纯算法：数据源由调用方提供 —— 任意「id + 可选 parentGraphId」序列皆可
 * （内存注册表 / 已加载图列表等），本函数不碰 I/O、无失败通道，失败策略归调用方。
 * visited 集合防御异常数据成环（正常数据单亲不成环，防御性保留，如自身为父的坏数据）。
 *
 * @param rootId - 起始图 id
 * @param graphs - 参与遍历的图序列（只需 id 与 parentGraphId）
 * @returns BFS 层序图 id（根图在首）；rootId 不在 graphs 中时仅含自身
 */
export function collectDescendantIds(
    rootId: GraphId,
    graphs: Iterable<{ id: GraphId; parentGraphId?: GraphId }>,
): GraphId[] {
    // 阶段一：建 parentGraphId → 子图 id 索引；无父图的根图不入表
    const childrenByParent = new Map<GraphId, GraphId[]>()

    for (const graph of graphs) {
        const parentId = graph.parentGraphId
        if (!parentId) continue

        const siblings = childrenByParent.get(parentId)
        if (siblings) siblings.push(graph.id)
        else childrenByParent.set(parentId, [graph.id])
    }

    // 阶段二：从 rootId 起 BFS，层序收集自身与全部后代
    const ids: GraphId[] = []
    const visited = new Set<GraphId>()
    const queue: GraphId[] = [rootId]
    let head = 0

    while (head < queue.length) {
        const graphId = queue[head++]
        if (graphId === undefined || visited.has(graphId)) continue
        visited.add(graphId)
        ids.push(graphId)
        queue.push(...(childrenByParent.get(graphId) ?? []))
    }

    return ids
}
