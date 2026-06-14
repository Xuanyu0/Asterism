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
    /** 节点 label 最大字符数。 */
    nodeLabelMaxLength: number

    /** 边 label 最大字符数。 */
    edgeLabelMaxLength: number

    /** 节点 summary 最大字符数。 */
    summaryMaxLength: number

    /** 软限制：超出提示但仍允许。 */
    nodeSoftLimit: number

    /** 警告限制：超出发出 warning。 */
    nodeWarningLimit: number

    /** 硬限制：到达后禁止新增节点。 */
    nodeHardLimit: number

    /**
     * 孤立节点（degree = 0）的基准外接圆半径 r₀。
     *
     * 半径统一为外接圆半径——圆形 = 几何半径，正多边形 = 中心到顶点距离。
     * 碰撞检测、渲染均以此值为基准。
     */
    r0: number

    /** 半径上限 r_max，防止特大节点抢占视图。 */
    rMax: number
}

export const DEFAULT_GRAPH_RULES: GraphRules = {
    nodeLabelMaxLength: 20,
    edgeLabelMaxLength: 10,
    summaryMaxLength: 80,
    nodeSoftLimit: 50,
    nodeWarningLimit: 100,
    nodeHardLimit: 150,
    r0: 28,
    rMax: 96,
}
