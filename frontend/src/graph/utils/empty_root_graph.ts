/**
 * 空根图工厂：组装无节点、无边的 root 图骨架。
 *
 * @remarks
 * `id` 与 `title` 由调用方决定——创建根图的两个入口 ID 来源（调用方传入 / 现场生成）
 * 与默认标题各不相同，此处只收敛共同的空图结构字面量。落库仍须经
 * store.commitBatchToGraphs 统一管道，本函数只负责构造。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

/**
 * 构造一张空根图。
 *
 * @param id - 根图 ID（来源由调用方决定）
 * @param title - 根图标题
 * @returns 无节点、无边、折叠依赖为空的 root 图
 */
export function createEmptyRootGraph(id: GraphId, title: string): GraphData {
    return {
        id,
        kind: 'root',
        title,
        nodes: [],
        edges: [],
        cognitiveState: { foldedDependencies: [] },
    }
}
