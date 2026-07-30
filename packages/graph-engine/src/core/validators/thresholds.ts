/**
 * 功能：
 *     校验阈值常量。标签长度约束、图规模上限等。
 *
 * 总体结构：
 *     1. LabelRules：标签/摘要长度约束
 *     2. ScaleRules：图规模阈值
 *     3. GraphRules：校验规则聚合
 *     4. DEFAULT_LABEL_RULES / DEFAULT_SCALE_RULES / DEFAULT_GRAPH_RULES
 *
 * 与 core/layout_rules.ts 的关系：
 *     - layout_rules.ts 存放布局几何参数
 *     - 本文件存放校验阈值
 *     - 两者独立，各子系统按需引用
 *
 * 外部如何使用：
 *     import { DEFAULT_GRAPH_RULES } from '@my-project/graph-engine'
 *     import type { GraphRules } from '@my-project/graph-engine'
 */

export interface LabelRules {
    nodeLabelMaxLength: number
    edgeLabelMaxLength: number
    summaryMaxLength: number
}

export interface ScaleRules {
    nodeSoftLimit: number
    nodeWarningLimit: number
    nodeHardLimit: number
}

export interface GraphRules extends LabelRules, ScaleRules {}

export const DEFAULT_LABEL_RULES: LabelRules = {
    nodeLabelMaxLength: 8,
    edgeLabelMaxLength: 10,
    summaryMaxLength: 80,
}

export const DEFAULT_SCALE_RULES: ScaleRules = {
    nodeSoftLimit: 50,
    nodeWarningLimit: 100,
    nodeHardLimit: 150,
}

export const DEFAULT_GRAPH_RULES: GraphRules = {
    ...DEFAULT_LABEL_RULES,
    ...DEFAULT_SCALE_RULES,
}
