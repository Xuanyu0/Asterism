/**
 * operation_log.ts
 *
 * 功能：
 *     定义操作日志与状态标签的类型。两层模型：
 *         - 操作树：细粒度，自动记录每步操作，驱动临时撤销（Ctrl+Z / Ctrl+Y）
 *         - 状态标签：粗粒度，由用户显式提交，驱动历史回顾
 *
 * 总体结构：
 *     1. OperationLogEntry：单条操作日志（正向操作 + 逆操作序列 + 父节点引用 + 时间戳）
 *     2. OperationLog：操作树本体（entries + cursor）
 *     3. State：用户显式提交的状态标签，指向操作树中的某个 entry
 *
 * 规则：
 *     - parentIndex = -1 表示 entry 直接挂在基线 G₀ 下
 *     - 同一父节点的多个子节点构成分支
 *     - 子节点通过 entries.filter(e => e.parentIndex === cursor) 派生，不显式存储
 *     - State 是对操作树中某个位置的语义标签，不存储 GraphData 副本
 *     - 回退到一个 State = cursor 跳到该 entry，沿 parentIndex 链回放
 *
 * 外部使用方式：
 *     import type { OperationLogEntry, OperationLog, State } from '@my-project/graph-engine'
 */

import type { GraphOperation } from './atomic_operations'

export interface OperationLogEntry {
    operation: GraphOperation
    reversalOperations: GraphOperation[]
    parentIndex: number
    timestamp: string
}

/**
 * 功能：
 *     操作日志树。细粒度，驱动临时撤销。
 *
 * 规则：
 *     - cursor 为当前 entry 的索引。沿 parentIndex 链上溯到根 = 当前历史路径
 *     - Undo：cursor = entries[cursor].parentIndex（单链，无歧义）
 *     - Redo：查子节点。0 子 → 不可前进。1 子 → 自动走。≥2 子 → 前端弹出分支选择
 *     - 新操作：挂在当前 cursor 下。旧分支保留在 entries 中
 */
export interface OperationLog {
    entries: OperationLogEntry[]
    cursor: number
}

/**
 * 功能：
 *     用户显式提交的状态标签。指向操作树中的一个 entry。
 *
 * 规则：
 *     - State 不存储 GraphData 副本，仅存储操作树游标 + 用户摘要
 *     - 恢复一个 State = cursor 跳到 state.cursor，沿 parentIndex 链回放到该 entry
 *     - 回放路径上的所有操作在临时撤销粒度上仍然可逐个 undo/redo
 */
export interface State {
    cursor: number
    summary: string
    timestamp: string
}
