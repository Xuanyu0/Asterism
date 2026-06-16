/**
 * rules.ts
 *
 * 功能：
 *     定义知识图谱系统的行为规则常量。所有被多个子系统消费的
 *     行为参数集中在此文件，按 interface 分类，consumer 只取自己需要的。
 *
 * 总体结构：
 *     1. LayoutRules：碰撞半径（collision.ts 消费）
 *     2. NodeRules：节点渲染尺寸约束（渲染层消费，从 LayoutRules 派生）
 *     3. 常量：DEFAULT_LAYOUT_RULES / DEFAULT_NODE_RULES
 *
 * 与 checkers/rules.ts 的关系：
 *     - checkers/rules.ts 存放校验规则（标签长度、节点数阈值）
 *     - 本文件存放布局几何 + 视觉投影规则
 *     - 两者独立，各子系统按需引用，不跨层穿透
 *
 * 外部如何使用：
 *     import { DEFAULT_LAYOUT_RULES, DEFAULT_NODE_RULES } from '@my-project/graph-engine'
 *     import type { LayoutRules, NodeRules } from '@my-project/graph-engine'
 */

export interface LayoutRules {
    /**
     * 孤立节点（degree = 0）的基准外接圆半径 r₀。
     *
     * 半径统一为外接圆半径——圆形 = 几何半径，正多边形 = 中心到顶点距离。
     * 碰撞检测、渲染均以此值为基准。
     */
    r0: number

    /**
     * 碰撞间隙。碰撞校正时在障碍物表面外额外留出的最小距离，
     * 防止节点恰好接触。
     */
    collisionGap: number
}

export interface NodeRules {
    /**
     * 节点渲染直径 = 2 × r₀。
     *
     * 渲染层直接设为节点 width / height。
     */
    nodeDiameter: number

    /**
     * 推荐字号 = r₀ / 4。
     *
     * 比例保证圆心弦长单行容纳 8 个中文字符：
     *     fontSize = r₀ / 4  →  diameter = 8 × fontSize  →  chord ≥ 8 chars
     *
     * 渲染层可在此基础上 ±1px 微调，但不应脱离此约束。
     */
    fontSize: number
}

export const DEFAULT_LAYOUT_RULES: LayoutRules = {
    r0: 56,
    collisionGap: 2,
}

export const DEFAULT_NODE_RULES: NodeRules = {
    nodeDiameter: DEFAULT_LAYOUT_RULES.r0 * 2,
    fontSize: Math.floor(DEFAULT_LAYOUT_RULES.r0 / 4),  // 最多容纳 8 个中文字符
}
