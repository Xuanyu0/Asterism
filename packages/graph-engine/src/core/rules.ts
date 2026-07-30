/**
 * 功能：
 *     布局系统的几何参数配置。
 *
 * 总体结构：
 *     1. LayoutRules：碰撞半径 / 单位距离（collision.ts / placement.ts 消费）
 *     2. 常量：DEFAULT_LAYOUT_RULES
 *
 * 外部如何使用：
 *     import { DEFAULT_LAYOUT_RULES } from '@my-project/graph-engine'
 *     import type { LayoutRules } from '@my-project/graph-engine'
 */

export interface LayoutRules {
    /**
     * 布局系统的基准单位距离。
     *
     * 派生用途：孤立节点外接圆半径、格点背景间距、轨道半径、碰撞半径的计算基准。
     * 碰撞检测、渲染均以此值为基准。
     */
    unitDistance: number

    /**
     * 碰撞间隙。碰撞校正时在障碍物表面外额外留出的最小距离，
     * 防止节点恰好接触。
     */
    collisionGap: number
}

export const DEFAULT_LAYOUT_RULES: LayoutRules = {
    unitDistance: 42,
    collisionGap: 2,
}
