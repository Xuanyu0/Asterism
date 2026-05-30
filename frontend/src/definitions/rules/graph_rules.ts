/**
 * graph_rules.ts
 *
 * 功能：
 * 定义知识图谱系统的默认规则常量。
 *
 * 总体结构：
 * 1. GraphRules：规则配置的类型契约
 * 2. DEFAULT_GRAPH_RULES：MVP 阶段默认规则值
 *
 * 外部使用方式：
 * import { DEFAULT_GRAPH_RULES } from '@/types/graph_rules'
 * import type { GraphRules } from '@/types/graph_rules'
 */

export interface GraphRules {
    nodeLabelMaxLength: number    // 节点标签最大长度
    edgeLabelMaxLength: number    // 边标签最大长度
    summaryMaxLength: number    // 节点摘要最大长度
    nodeSoftLimit: number    // 节点数量舒适上限
    nodeWarningLimit: number    // 节点数量提醒上限
    nodeHardLimit: number    // 节点数量硬性上限
}

export const DEFAULT_GRAPH_RULES: GraphRules = {
    nodeLabelMaxLength: 20,    // 节点标签不超过 20 个中文字符
    edgeLabelMaxLength: 10,    // 边标签不超过 10 个中文字符
    summaryMaxLength: 80,    // 摘要不超过 80 字
    nodeSoftLimit: 50,    // 超过 50 个节点建议抽象
    nodeWarningLimit: 100,    // 超过 100 个节点强烈提醒抽象
    nodeHardLimit: 150,    // 超过 150 个节点拒绝新增节点
}
