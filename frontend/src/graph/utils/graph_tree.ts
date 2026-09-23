/**
 * 说明：
 *
 *     图谱树归属判定纯函数工具。沿 parentGraphId 链向上回溯，判断给定图是否属于
 *     指定图谱树；并向下遍历，收集以某根图为首的整棵树成员。
 *
 * 调用契约：
 *
 *     1. 只读持久化与传入参数，不持有任何状态。
 *     2. isInGraphTree 供导航用例层 deleteGraphTree（级联删除树成员收集）使用；
 *        collectGraphTreeIds 供导出用例层收集待导出子树使用。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { listGraphIds, loadGraph, type ReadResult } from '@/persistence'

/**
 * 说明：
 *
 *     沿 parentGraphId 链回溯，判断 graph 是否属于指定图谱树。
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
 * 收集以 rootId 为首的整棵图谱树的图 id。
 *
 * @remarks
 * 向下遍历：先扫描持久化全量图建立 parentGraphId → 子图索引，再从根做 BFS。
 * 是 parentGraphId 链构成森林这一域语义的实现，故留在域层 —— persistence/ 不该编码它。
 * visited 集合防御异常数据成环（正常数据单亲不成环，防御性保留，如自身为父的坏数据）。
 * 返回顺序为 BFS 层序（根图在首）；同层顺序取决于 listGraphIds 的返回顺序（无序）。
 *
 * @param rootId - 根图 id
 * @returns 成功 `{ ok: true, value }`（至少含 rootId 本身）；rootId 不存在为 missing；
 *          介质枚举 / 读取不可用为 unavailable；**索引构建阶段任一图读取失败**也整体失败
 *          （不跳过 —— 取舍见函数内注释）。
 */
export function collectGraphTreeIds(rootId: GraphId): ReadResult<GraphId[]> {
    const listed = listGraphIds()
    if (!listed.ok) return listed

    if (!listed.value.includes(rootId)) {
        return { ok: false, reason: 'missing' }
    }

    const childrenByParent = new Map<GraphId, GraphId[]>()
    for (const graphId of listed.value) {
        const result = loadGraph(graphId)
        if (!result.ok) {
            // 索引构建阶段任一图读取失败都整体失败：
            // 读不到 parentGraphId 就无法判断该图是否属于目标树 —— 跳过会把
            // 「父图损坏 → 其后代整支消失」变成一次【不完整却报成功】的导出，
            // 而数据层的不变式是「缺图的导出是不完整副本，比失败更危险」
            // （见 persistence/coordination/export_graphs.ts 头注释）。
            // 代价（接受）：一张【无关】图损坏也会导致导出失败 —— 可见的失败优于静默的不完整。
            return result
        }
        const parentId = result.value.parentGraphId
        if (!parentId) continue

        const siblings = childrenByParent.get(parentId)
        if (siblings) siblings.push(graphId)
        else childrenByParent.set(parentId, [graphId])
    }

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

    return { ok: true, value: ids }
}
