/**
 * geometry.ts
 *
 * 功能：
 *     二维向量几何原语。全部即时计算，不持有状态。
 *
 * 总体结构：
 *     向量运算（sub / add / scale）+ 标量运算（length / distance / squaredDistance / normalize）
 *
 * 规则：
 *     1. 坐标使用 NodePosition 类型的 x/y 分量。
 *     2. normalize 对零向量返回 (1, 0) 作为默认方向。
 *
 * 外部如何使用：
 *     import { sub, add, scale, length, distance, squaredDistance, normalize } from './geometry'
 */

import type { NodePosition } from '../types/graph_data'

export function sub(a: NodePosition, b: NodePosition): NodePosition {
    return { x: a.x - b.x, y: a.y - b.y }
}

export function add(a: NodePosition, b: NodePosition): NodePosition {
    return { x: a.x + b.x, y: a.y + b.y }
}

export function scale(v: NodePosition, s: number): NodePosition {
    return { x: v.x * s, y: v.y * s }
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

export function normalize(v: NodePosition): NodePosition {
    const len = length(v)

    if (len < 1e-8) return { x: 1, y: 0 }

    return { x: v.x / len, y: v.y / len }
}
