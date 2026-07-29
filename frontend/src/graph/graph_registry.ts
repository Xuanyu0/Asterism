/**
 * graph_registry.ts
 *
 * 功能：
 *     多图注册表管理。GraphId → GraphData 映射的纯函数包装。
 *     本文件属于 Runtime 层——引擎是纯函数不持有状态，Registry 由前端 Runtime 持有。
 *
 * 总体结构：
 *     1. GraphRegistry  — GraphId → GraphData 映射类型别名
 *     2. createRegistry  — 创建空注册表
 *     3. 五个访问函数   — register / lookup / has / unregister / listIds
 *
 * 规则：
 *     1. 不持有全局状态——factory + 显式传参。
 *     2. 不负责图内校验。
 *     3. 始终以 GraphRegistry 类型名使用，禁止裸 Map<GraphId, GraphData>。
 *
 * 外部如何使用：
 *     import { createRegistry, registerGraph, lookupGraph } from '@/graph/graph_registry'
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

/** GraphId → GraphData 注册表。禁止直接使用裸 Map<GraphId, GraphData>。 */
export type GraphRegistry = Map<GraphId, GraphData>

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

/**
 * 功能：
 *
 *     按 graphId 查找对应 GraphData。体现 "id → GraphData" 映射语义。
 */
export function lookupGraph(registry: GraphRegistry, graphId: GraphId): GraphData | undefined {
    return registry.get(graphId)
}

export function hasGraph(registry: GraphRegistry, graphId: GraphId): boolean {
    return registry.has(graphId)
}

export function unregisterGraph(registry: GraphRegistry, graphId: GraphId): boolean {
    return registry.delete(graphId)
}


