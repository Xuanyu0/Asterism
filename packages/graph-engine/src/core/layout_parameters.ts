/**
 * 布局系统的几何参数配置。
 *
 * @remarks
 * 布局几何参数（非校验规则），被 placement / collision / cognitive（deconstruct /
 * induce / internalize）与前端渲染层消费。经 index.ts 公开导出。
 */

export interface LayoutParameters {
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

export const DEFAULT_LAYOUT_PARAMETERS: LayoutParameters = {
    unitDistance: 42,
    collisionGap: 2,
}
