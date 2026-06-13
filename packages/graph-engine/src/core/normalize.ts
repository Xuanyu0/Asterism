/**
 * normalize.ts
 *
 * 功能：
 *     补齐 GraphData 的认知状态默认值。
 *
 * 规则：
 *     1. 只补充缺失的默认字段。
 *     2. 不修改已有字段。
 *
 * 外部如何使用：
 *     import { normalizeGraph } from '@my-project/graph-engine'
 */

import type { GraphData } from '../types/graph_data'

export function normalizeGraph(graph: GraphData): GraphData {
    return {
        ...graph,
        cognitiveState: graph.cognitiveState ?? {
            foldedDependencies: [],
        },
    }
}
