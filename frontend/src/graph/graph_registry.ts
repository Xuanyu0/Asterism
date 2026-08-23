/**
 * 多图注册表管理：GraphId → GraphData 映射的纯函数包装。
 *
 * @remarks
 * 属于 Runtime 层——引擎是纯函数不持有状态，注册表由前端 Runtime 持有。
 * GraphRegistry 类型直接复用引擎导出（与 applyBatches 参数同型），避免双份定义漂移。
 * 不持有全局状态（factory + 显式传参）、不负责图内校验，统一以 GraphRegistry
 * 类型名使用，禁止裸 Map<GraphId, GraphData>。
 */

import type {
    GraphData,
    GraphId,
    GraphRegistry,
} from '@my-project/graph-engine'

// 复用引擎导出的 GraphRegistry（applyBatches 参数同型），避免双份定义漂移；
// 同时保持既有 import type { GraphRegistry } from '@/graph/graph_registry' 调用点不变
export type { GraphRegistry }

export function createRegistry(): GraphRegistry {
    return new Map()
}

/**
 * 注册（或覆盖）一个图谱。
 * 若 graphId 已存在则静默替换旧数据——调用方如需保护旧数据请先调 hasGraph。
 */
export function registerGraph(registry: GraphRegistry, graph: GraphData): void {
    registry.set(graph.id, graph)
}

/** 按 graphId 查找对应 GraphData。体现 "id → GraphData" 映射语义。 */
export function lookupGraph(
    registry: GraphRegistry,
    graphId: GraphId,
): GraphData | undefined {
    return registry.get(graphId)
}

export function hasGraph(registry: GraphRegistry, graphId: GraphId): boolean {
    return registry.has(graphId)
}

export function unregisterGraph(
    registry: GraphRegistry,
    graphId: GraphId,
): boolean {
    return registry.delete(graphId)
}
