/**
 * 节点几何派生量的纯函数单源。
 *
 * @remarks
 * 节点半径公式被 collision 与 induce 共用，集中于此避免公式漂移。
 * degree = 0 时半径为 unitDistance，保证孤立节点仍占可视空间。
 */

/**
 * 计算节点的外接圆半径。
 *
 * @param degree - 节点度数
 * @param unitDistance - 基准单位距离，由调用方传入各自的模块级快照
 * @param override - 半径覆盖值，存在时优先于公式结果
 * @returns 外接圆半径
 */
export function computeNodeRadius(degree: number, unitDistance: number, override?: number): number {
    return override ?? unitDistance * Math.sqrt(1 + degree)
}
