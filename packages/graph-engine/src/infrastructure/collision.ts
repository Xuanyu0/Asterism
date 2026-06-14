/**
 * collision.ts
 *
 * 功能：
 *     节点碰撞约束与路径规划。全部纯几何计算，不持有状态，不引用 DOM。
 *
 * 总体结构：
 *     1. constrainPosition — 单点单帧碰撞约束（拖拽实时用）
 *     2. computePath — 两点间无碰撞路径规划（布局算法、批量移动用）
 *     3. untangleCluster — 批量解绕（图加载、密集区初始化用）
 *     4. 内部几何辅助函数
 *
 * 规则：
 *     1. 所有节点视为外接圆。正多边形与圆形的碰撞统一用外接圆半径。
 *     2. 半径公式：r = r₀ · √(1 + degree)，上限 r_max。degree 翻倍 → 面积翻倍。
 *     3. 虚节点固定使用 r₀，不参与度数映射。虚节点完全不可被移动。
 *     4. NodeRadiusMap 为特例覆盖（调整特定节点半径），缺失时按公式计算。
 *     5. computePath 是只读搜索——不修改任何节点的位置。
 *     6. ε = 2（最小间隙），防止节点恰好接触。
 *
 * 外部如何使用：
 *     import { constrainPosition, computePath, untangleCluster } from '@my-project/graph-engine'
 */

import type { NodeData, NodeId, NodePosition, NodeRadiusMap } from '../types/graph_data'
import { DEFAULT_GRAPH_RULES } from '../core/checkers/rules'

// ═══════════ 常量 ═══════════

/** 基准外接圆半径 r₀（来自 DEFAULT_GRAPH_RULES）。 */
const R0 = DEFAULT_GRAPH_RULES.r0

/** 半径上限 r_max（来自 DEFAULT_GRAPH_RULES）。 */
const R_MAX = DEFAULT_GRAPH_RULES.rMax

/** 最小间隙，防止节点恰好接触。 */
const EPSILON = 2

/** computePath 最大递归深度（≈ 障碍物层数 × 2）。 */
const MAX_PATH_DEPTH = 8

// ═══════════ 内部类型 ═══════════

interface Circle {
    center: NodePosition
    radius: number
}

interface PathResult {
    waypoints: NodePosition[]
    ok: boolean
}

// ═══════════ 内部：几何辅助函数 ═══════════

function dot(a: NodePosition, b: NodePosition): number {
    return a.x * b.x + a.y * b.y
}

function sub(a: NodePosition, b: NodePosition): NodePosition {
    return { x: a.x - b.x, y: a.y - b.y }
}

function add(a: NodePosition, b: NodePosition): NodePosition {
    return { x: a.x + b.x, y: a.y + b.y }
}

function scale(v: NodePosition, s: number): NodePosition {
    return { x: v.x * s, y: v.y * s }
}

function length(v: NodePosition): number {
    return Math.sqrt(v.x * v.x + v.y * v.y)
}

function normalize(v: NodePosition): NodePosition {
    const len = length(v)

    if (len < 1e-8) return { x: 1, y: 0 }

    return { x: v.x / len, y: v.y / len }
}

function distance(a: NodePosition, b: NodePosition): number {
    return length(sub(a, b))
}

function rotate(v: NodePosition, angle: number): NodePosition {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
    }
}

// ═══════════ 内部：节点辅助函数 ═══════════

function getRadius(node: NodeData, radiusMap: NodeRadiusMap): number {
    const custom = radiusMap.get(node.id)

    if (custom !== undefined) return custom

    if (isVirtual(node)) return R0

    return Math.min(R_MAX, R0 * Math.sqrt(1 + node.degree))
}

function isVirtual(node: NodeData): boolean {
    return node.role === 'knowledge' && node.kind === 'virtual'
}

function hasPosition(node: NodeData): node is NodeData & { position: NodePosition } {
    return node.position !== undefined
}

function toCircle(node: NodeData, radiusMap: NodeRadiusMap): Circle | null {
    if (!node.position) return null

    return { center: node.position, radius: getRadius(node, radiusMap) }
}

// ═══════════ 内部：射线-圆检测 ═══════════

/**
 * 检测线段 from→to 是否与任何其他节点的圆相交。
 * 返回第一个相交的节点 id，无相交返回 null。
 *
 * 忽略 fromNodeId 和 toNodeId（不与之碰撞检测）。
 * 只检测有 position 的节点。
 */
function rayIntersectsAny(
    from: NodePosition,
    to: NodePosition,
    nodes: NodeData[],
    radiusMap: NodeRadiusMap,
    ignoreNodeId: NodeId,
): NodeId | null {
    const segDir = sub(to, from)
    const segLen = length(segDir)
    const segNorm = segLen > 1e-8 ? scale(segDir, 1 / segLen) : null

    let closestNodeId: NodeId | null = null
    let closestDist = Infinity

    for (const node of nodes) {
        if (node.id === ignoreNodeId) continue
        if (!hasPosition(node)) continue

        const circle = toCircle(node, radiusMap)
        if (!circle) continue

        // 线段到圆心的最近点
        const toCenter = sub(circle.center, from)

        if (!segNorm) {
            // 线段退化为点
            const d = length(toCenter)
            if (d < circle.radius) {
                if (d < closestDist) {
                    closestDist = d
                    closestNodeId = node.id
                }
            }
            continue
        }

        let t = dot(toCenter, segNorm)

        if (t < 0) t = 0
        if (t > segLen) t = segLen

        const closestPoint = add(from, scale(segNorm, t))
        const d = distance(closestPoint, circle.center)

        if (d < circle.radius) {
            if (d < closestDist) {
                closestDist = d
                closestNodeId = node.id
            }
        }
    }

    return closestNodeId
}

// ═══════════ 内部：切线绕行计算 ═══════════

/**
 * 计算从点 from 到障碍圆 circle 的两个切点。
 * 返回 [左绕切点, 右绕切点]。
 */
function computeTangentPoints(from: NodePosition, circle: Circle): [NodePosition, NodePosition] | null {
    const d = distance(from, circle.center)

    if (d <= circle.radius) {
        // 点在圆内或圆上，无切线
        return null
    }

    // 直角三角形：from→center 为斜边 d，center→切点为直角边 r
    // 切点处的角度 θ = asin(r/d)，切点距 from = d · cos(θ) = sqrt(d² − r²)
    const dirToCenter = normalize(sub(circle.center, from))
    const angle = Math.asin(circle.radius / d)
    const tangentDist = d * Math.cos(angle) // = sqrt(d² − r²)

    const tangentDir1 = rotate(dirToCenter, angle)
    const tangentDir2 = rotate(dirToCenter, -angle)

    return [
        add(from, scale(tangentDir1, tangentDist)),
        add(from, scale(tangentDir2, tangentDist)),
    ]
}

// ═══════════ 公开 API ═══════════

/**
 * 功能：
 *     单点单帧碰撞约束。desired 无重叠则原样返回。
 *     有重叠则沿接触法向推至表面 + ε。
 *
 * 规则：
 *     虚节点不检测——虚节点不参与拖拽。
 *     被约束的目标节点如果是虚节点，直接返回原位置不变。
 *     多重阻塞时取最大推开向量。
 */
export function constrainPosition(
    targetNodeId: NodeId,
    desired: NodePosition,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
): { position: NodePosition; adjusted: boolean } {
    const targetNode = allNodes.find(node => node.id === targetNodeId)

    // 找不到目标节点或目标节点不可移动 → 不约束
    if (!targetNode) return { position: desired, adjusted: false }
    if (isVirtual(targetNode)) return { position: desired, adjusted: false }

    const targetRadius = getRadius(targetNode, radiusMap)
    let adjustedPosition = { x: desired.x, y: desired.y }
    let adjusted = false

    for (const other of allNodes) {
        if (other.id === targetNodeId) continue
        if (!hasPosition(other)) continue

        const otherCircle = toCircle(other, radiusMap)
        if (!otherCircle) continue

        const d = distance(adjustedPosition, other.position)
        const minDist = targetRadius + otherCircle.radius

        if (d >= minDist) continue

        // 碰撞：沿法向推到表面 + ε
        const overlap = minDist - d
        const normal = d > 0
            ? normalize(sub(adjustedPosition, other.position))
            : { x: 1, y: 0 }

        const pushDist = overlap + EPSILON
        adjustedPosition = add(adjustedPosition, scale(normal, pushDist))
        adjusted = true
    }

    return { position: adjustedPosition, adjusted }
}

/**
 * 功能：
 *     两点间无碰撞路径规划（只读——不修改任何节点位置）。
 *
 * 算法：
 *     第 0 层：射线检测 from→to 是否碰撞任何节点。
 *     无碰撞 → 返回 [to]。
 *     有碰撞 → 进入第 1 层。
 *     第 1 层：对阻塞节点做切向绕行（左绕 / 右绕），递归检测绕行路径段。
 *     绕不过 → 返回 { ok: false }。
 *
 * 已知限制：
 *     单切点绕行不能处理"障碍物正心居中"——绕行后第二段路径可能再次穿过
 *     同一障碍物的影区，导致绕行失败。此时返回 { ok: false }。解决方案是
 *     双切点（entry + exit）绕行，留待后续。
 *
 * 使用：
 *     const result = computePath("n1", {x:0,y:0}, {x:100,y:0}, graph.nodes, radiusMap)
 *     if (result.ok) { // waypoints in result.waypoints
 *     }
 */
export function computePath(
    nodeId: NodeId,
    from: NodePosition,
    to: NodePosition,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
): PathResult {
    return computePathRecursive(nodeId, from, to, allNodes, radiusMap, 0)
}

function computePathRecursive(
    nodeId: NodeId,
    from: NodePosition,
    to: NodePosition,
    allNodes: NodeData[],
    radiusMap: NodeRadiusMap,
    depth: number,
): PathResult {
    if (depth > MAX_PATH_DEPTH) {
        return { waypoints: [], ok: false }
    }

    // 第 0 层：射线测试
    const blockedBy = rayIntersectsAny(from, to, allNodes, radiusMap, nodeId)

    if (!blockedBy) {
        return { waypoints: [to], ok: true }
    }

    // 第 1 层：对阻塞节点作切向绕行
    const blocker = allNodes.find(node => node.id === blockedBy)
    if (!blocker || !hasPosition(blocker)) {
        return { waypoints: [], ok: false }
    }

    const blockerCircle = toCircle(blocker, radiusMap)
    if (!blockerCircle) {
        return { waypoints: [], ok: false }
    }

    const tangents = computeTangentPoints(from, blockerCircle)
    if (!tangents) {
        // 起点已在障碍圆内，无法绕行
        return { waypoints: [], ok: false }
    }

    const [tangent1, tangent2] = tangents

    // 选择更靠近 to 的切点优先尝试
    const candidates = distance(tangent1, to) <= distance(tangent2, to)
        ? [tangent1, tangent2]
        : [tangent2, tangent1]

    let bestResult: PathResult = { waypoints: [], ok: false }
    let bestLength = Infinity

    for (const tangent of candidates) {
        // 递归：from→切线点 和 切线点→to 分别规划
        const firstLeg = computePathRecursive(nodeId, from, tangent, allNodes, radiusMap, depth + 1)
        if (!firstLeg.ok) continue

        const secondLeg = computePathRecursive(
            nodeId,
            firstLeg.waypoints[firstLeg.waypoints.length - 1] ?? tangent,
            to,
            allNodes,
            radiusMap,
            depth + 1,
        )
        if (!secondLeg.ok) continue

        // 拼接完整路径：from→...→切点→...→to
        const fullWaypoints = [...firstLeg.waypoints, ...secondLeg.waypoints]
        const totalLength = computePathLength(from, fullWaypoints)

        if (totalLength < bestLength) {
            bestLength = totalLength
            bestResult = { waypoints: fullWaypoints, ok: true }
        }
    }

    return bestResult
}

function computePathLength(from: NodePosition, waypoints: NodePosition[]): number {
    let total = 0
    let prev = from

    for (const wp of waypoints) {
        total += distance(prev, wp)
        prev = wp
    }

    return total
}

/**
 * 功能：
 *     批量解绕。迭代逐对检测并沿法向推开至收敛。
 *
 * 规则：
 *     虚节点完全不可被移动（其位置作为固定约束）。
 *     每次推开距离 = overlap / 2 + ε（双方各承担一半，不可移动方除外）。
 *     最多迭代 20 轮，收敛后返回调整后的位置。
 */
export function untangleCluster(
    nodes: NodeData[],
    radiusMap: NodeRadiusMap,
): { adjusted: Map<NodeId, NodePosition>; didResolve: boolean } {
    const positions = new Map<NodeId, NodePosition>()
    const immovable = new Set<NodeId>()

    // 初始位置
    for (const node of nodes) {
        if (!hasPosition(node)) continue

        positions.set(node.id, { x: node.position.x, y: node.position.y })

        if (isVirtual(node)) {
            immovable.add(node.id)
        }
    }

    let didResolve = false
    const MAX_ITER = 20

    for (let iter = 0; iter < MAX_ITER; iter++) {
        let anyCollision = false

        for (let i = 0; i < nodes.length; i++) {
            const nodeA = nodes[i]
            if (!nodeA) continue

            const posA = positions.get(nodeA.id)
            if (!posA) continue

            const radA = getRadius(nodeA, radiusMap)

            for (let j = i + 1; j < nodes.length; j++) {
                const nodeB = nodes[j]
                if (!nodeB) continue

                const posB = positions.get(nodeB.id)
                if (!posB) continue

                const radB = getRadius(nodeB, radiusMap)

                const d = distance(posA, posB)
                const minDist = radA + radB

                if (d >= minDist) continue

                // 碰撞 — 沿法向推开
                anyCollision = true
                const overlap = minDist - d

                const normal = d > 0
                    ? normalize(sub(posA, posB))
                    : { x: 1, y: 0 }

                const pushDist = overlap / 2 + EPSILON / 2
                const aImmovable = immovable.has(nodeA.id)
                const bImmovable = immovable.has(nodeB.id)

                if (aImmovable && bImmovable) {
                    continue // 两个都不可动
                }

                if (aImmovable) {
                    // 只推 B
                    positions.set(nodeB.id, sub(posB, scale(normal, overlap + EPSILON)))
                } else if (bImmovable) {
                    // 只推 A
                    positions.set(nodeA.id, add(posA, scale(normal, overlap + EPSILON)))
                } else {
                    // 双方推开
                    positions.set(nodeA.id, add(posA, scale(normal, pushDist)))
                    positions.set(nodeB.id, sub(posB, scale(normal, pushDist)))
                }
            }
        }

        if (!anyCollision) {
            didResolve = true
            break
        }

        didResolve = true // 至少做了一轮清理
    }

    return { adjusted: positions, didResolve }
}

// ═══════════════════════════════════════════
// 未来改进：势场梯度路径规划

/**
 * 当前 computePath 使用几何 DFS（射线检测 + 切向绕行），已知限制：障碍物正心居中时绕行失败。
 *
 * 替代方案：势场梯度法（Potential Field Gradient Descent）。
 *
 * 原理：
 *     目标坐标作为"目标方向源"——每一步沿"指向目标的方向 + 远离障碍物表面的方向"的加权和前进。
 *     障碍物表面法向反推强度与距离平方成反比，天然绕开。
 *
 * 签不变：
 *     computePath(nodeId, from, to, allNodes, radiusMap) → { waypoints[], ok }
 *
 * 优势：
 *     - 正心居中障碍物自动绕开，不返回 unreachable
 *     - 路径点密集 → 前端样条插值后天然光滑
 *     - 不需要递归，不区分"单障碍/多障碍"
 *
 * 代价：
 *     - 三个硬编码参数（k_att / k_rep / η 步长），调参
 *     - 数学固有缺陷：极少数几何构型下梯度为零（局部最小值），仍需返回 unreachable
 *
 * 改造成本：
 *     - 替换 computePath / computePathRecursive 两个函数，约 80 行
 *     - constrainPosition / untangleCluster 不变
 *     - 不影响调用方
 *
 * 不在此次版本实现。所有几何交互对接完毕后再评估是否切换。
 */
