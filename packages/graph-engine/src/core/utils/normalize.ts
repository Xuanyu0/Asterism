/**
 * 说明：
 *
 *     确保 GraphData 的认知状态默认值存在（缺则补 `foldedDependencies: []`）。
 *     localStorage 旧数据可能缺 cognitiveState，而折叠/展开操作依赖其存在。
 *
 * 调用契约：
 *
 *     不修改已有字段，只补缺失的默认值。
 *
 * TODO：
 *
 *     本函数是否保留（收敛进数据入口统一补齐，还是随类型收紧移除）待定。
 */

import type { GraphData } from '../../types/graph_data'

export function ensureDefaultCognitiveState(graph: GraphData): GraphData {
    return {
        ...graph,
        cognitiveState: graph.cognitiveState ?? {
            foldedDependencies: [],
        },
    }
}
