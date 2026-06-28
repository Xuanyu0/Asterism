/**
 * search.ts
 *
 * 功能：
 *     图节点搜索引擎。按 label 子串匹配节点，支持全图搜索和单图搜索。
 *
 * 总体结构：
 *     1. searchNodes — 主入口，按 graphIds + 可选 graphId 分派搜索范围
 *     2. buildGraphPath — parentGraphId 回溯构造根图到目标图的路径
 *
 * 规则：
 *     1. 匹配方式：node.label 子串包含 query（大小写敏感）。
 *     2. graphId 传入 → 只搜指定图。不传 → 遍历 graphIds 全部图。
 *     3. 结果含 graphPath 字段（根图 → 目标图的 GraphId 链），通过 lookupGraph 回溯。
 *     4. 0 结果 → 返回 []，不报错。
 *     5. 查询串为空 → 返回 []。
 *
 * 外部如何使用：
 *     import { searchNodes } from '@my-project/graph-engine'
 */

import type { GraphData, GraphId } from '../types/graph_data'
import type { GraphLookup, SearchResult } from '../types/infrastructure_types'

/**
 * 功能：
 *     按 label 子串搜索节点。
 *
 * 使用：
 *     searchNodes("递归", allGraphIds, lookupGraph)           → 搜全部已注册图
 *     searchNodes("递归", allGraphIds, lookupGraph, "g1")     → 只搜 g1
 */
export function searchNodes(
    query: string,
    graphIds: GraphId[],
    lookupGraph: GraphLookup,
    graphId?: GraphId,
): SearchResult[] {
    if (!query) {
        return []
    }

    if (graphId !== undefined) {
        const graph = lookupGraph(graphId)

        if (!graph) {
            return []
        }

        return searchInGraph(query, graph, lookupGraph)
    }

    const results: SearchResult[] = []

    for (const id of graphIds) {
        const graph = lookupGraph(id)

        if (!graph) {
            continue
        }

        results.push(...searchInGraph(query, graph, lookupGraph))
    }

    return results
}

function searchInGraph(
    query: string,
    graph: GraphData,
    lookupGraph: GraphLookup,
): SearchResult[] {
    const results: SearchResult[] = []

    for (const node of graph.nodes) {
        if (node.label.includes(query)) {
            results.push({
                graphId: graph.id,
                nodeId: node.id,
                node,
                graphPath: buildGraphPath(graph, lookupGraph),
            })
        }
    }

    return results
}

function buildGraphPath(graph: GraphData, lookupGraph: GraphLookup): GraphId[] {
    const path: GraphId[] = [graph.id]

    // parentGraphId: undefined = 根图
    let currentGraph = graph
    while (currentGraph.parentGraphId) {
        const parent = lookupGraph(currentGraph.parentGraphId)

        if (!parent) {
            break
        }

        path.unshift(currentGraph.parentGraphId)
        currentGraph = parent
    }

    return path
}
