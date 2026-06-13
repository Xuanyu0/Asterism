/**
 * rules.ts
 *
 * 功能：
 *     定义知识图谱系统的默认规则常量。
 *
 * 总体结构：
 *     1. GraphRules：规则配置的类型契约
 *     2. DEFAULT_GRAPH_RULES：默认规则值
 *
 * 外部如何使用：
 *     import { DEFAULT_GRAPH_RULES } from '@my-project/graph-engine'
 */

export interface GraphRules {
    nodeLabelMaxLength: number
    edgeLabelMaxLength: number
    summaryMaxLength: number
    nodeSoftLimit: number
    nodeWarningLimit: number
    nodeHardLimit: number
    referenceNodeHardLimit: number
}

export const DEFAULT_GRAPH_RULES: GraphRules = {
    nodeLabelMaxLength: 20,
    edgeLabelMaxLength: 10,
    summaryMaxLength: 80,
    nodeSoftLimit: 50,
    nodeWarningLimit: 100,
    nodeHardLimit: 150,
    // 引用节点数量限制 R1 待定，暂与普通节点同值
    referenceNodeHardLimit: 150,
}
