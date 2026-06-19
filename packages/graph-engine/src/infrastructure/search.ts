/**
 * search.ts
 *
 * 功能：
 *     图节点搜索引擎。按 label 子串匹配节点，支持单图搜索和全注册表搜索。
 *
 * 总体结构：
 *     1. searchNodes — 主入口，按 graphId? 参数分派搜索范围
 *     2. searchSingleGraph — 单图搜索
 *     3. searchAllGraphs — 遍历注册表全部图搜索
 *     4. buildGraphPath — parentGraphId 回溯构造根图到目标图的路径
 *
 * 规则：
 *     1. 匹配方式：node.label 子串包含 query（大小写敏感）。
 *     2. graphId 传入 → 只搜指定图。不传 → 搜注册表全部图。
 *     3. 结果含 graphPath 字段（根图 → 目标图的 GraphId 链）。
 *     4. 0 结果 → 返回 []，不报错。
 *     5. 查询串为空 → 返回 []。
 *
 * 外部如何使用：
 *     import { searchNodes } from '@my-project/graph-engine'
 */

import type { GraphData, GraphId } from '../types/graph_data'
import type { GraphRegistry, SearchResult } from '../types/infrastructure_types'
import { getGraph } from './graph_registry'

/**
 * 功能：
 *     按 label 子串搜索节点。
 *
 * 使用：
 *     searchNodes("递归", registry)                     → 搜所有图
 *     searchNodes("递归", registry, "graph-1")          → 只搜 graph-1
 */
export function searchNodes(
    query: string,
    registry: GraphRegistry,
    graphId?: GraphId,
): SearchResult[] {
    if (!query) {
        return []
    }

    if (graphId !== undefined) {
        const graph = getGraph(registry, graphId)

        if (!graph) {
            return []
        }

        return searchSingleGraph(query, graph, registry)
    }

    return searchAllGraphs(query, registry)
}

function searchSingleGraph(
    query: string,
    graph: GraphData,
    registry: GraphRegistry,
): SearchResult[] {
    const results: SearchResult[] = []

    for (const node of graph.nodes) {
        if (node.label.includes(query)) {
            results.push({
                graphId: graph.id,
                nodeId: node.id,
                node,
                graphPath: buildGraphPath(graph, registry),
            })
        }
    }

    return results
}

function searchAllGraphs(query: string, registry: GraphRegistry): SearchResult[] {
    const results: SearchResult[] = []

    for (const graph of registry.values()) {
        results.push(...searchSingleGraph(query, graph, registry))
    }

    return results
}

function buildGraphPath(graph: GraphData, registry: GraphRegistry): GraphId[] {
    const path: GraphId[] = [graph.id]

    // parentGraphId: undefined = 根图
    let currentGraph = graph
    while (currentGraph.parentGraphId && registry.has(currentGraph.parentGraphId)) {
        path.unshift(currentGraph.parentGraphId)
        currentGraph = registry.get(currentGraph.parentGraphId)!
    }

    return path
}
