/**
 * graph_registry.ts
 *
 * 功能：
 *     多图上下文管理。Map<GraphId, GraphData> 的纯函数包装。
 *
 * 总体结构：
 *     1. createRegistry — 创建空注册表
 *     2. 五个访问函数 — get / set / has / delete / list
 *
 * 规则：
 *     1. 不持有全局状态——factory + 显式传参。
 *     2. 不负责图内校验。
 *     3. GraphRegistry = Map<GraphId, GraphData>，类型别名已定义在 types/graph_data.ts。
 *
 * 外部如何使用：
 *     import { createRegistry, registerGraph, getGraph } from '@my-project/graph-engine'
 */

import type { GraphData, GraphId, GraphRegistry } from '../types/graph_data'

export function createRegistry(): GraphRegistry {
    return new Map()
}

/**
 * 功能：
 *
 *     注册（或覆盖）一个图谱。
 *     若 graphId 已存在则静默替换旧数据——调用方如需保护旧数据请先调 hasGraph。
 */
export function registerGraph(registry: GraphRegistry, graph: GraphData): void {
    registry.set(graph.id, graph)
}

export function getGraph(registry: GraphRegistry, graphId: GraphId): GraphData | undefined {
    return registry.get(graphId)
}

export function hasGraph(registry: GraphRegistry, graphId: GraphId): boolean {
    return registry.has(graphId)
}

export function unregisterGraph(registry: GraphRegistry, graphId: GraphId): boolean {
    return registry.delete(graphId)
}

export function listGraphs(registry: GraphRegistry): GraphData[] {
    return Array.from(registry.values())
}
