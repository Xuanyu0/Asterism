/**
 * geometry.ts
 *
 * 功能：
 *     二维向量几何原语。全部即时计算，不持有状态。
 *
 * 总体结构：
 *     向量运算（sub）+ 标量运算（length / distance / squaredDistance）
 *
 * 规则：
 *     1. 坐标使用 NodePosition 类型的 x/y 分量。
 *
 * 外部如何使用：
 *     import { sub, length, distance, squaredDistance } from './geometry'
 */

import type { NodePosition } from '../types/graph_data'

export function sub(a: NodePosition, b: NodePosition): NodePosition {
    return { x: a.x - b.x, y: a.y - b.y }
}

export function length(v: NodePosition): number {
    return Math.sqrt(v.x * v.x + v.y * v.y)
}

export function distance(a: NodePosition, b: NodePosition): number {
    return length(sub(a, b))
}

export function squaredDistance(a: NodePosition, b: NodePosition): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return dx * dx + dy * dy
}
