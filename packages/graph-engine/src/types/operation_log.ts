/**
 * operation_log.ts
 *
 * 功能：
 *     定义操作日志的类型。支持 Git 追加模型——entry 永不删除，cursor 移动定位当前状态。
 *
 * 总体结构：
 *     1. OperationLogEntry：单条日志（正向操作 + 逆操作序列 + 时间戳）
 *     2. OperationLog：日志本体（entries + cursor）
 *     3. ReflogEntry：游标历史位置，支持恢复被覆盖的分支
 *
 * 外部使用方式：
 *     import type { OperationLogEntry, OperationLog, ReflogEntry } from '@my-project/graph-engine'
 */

import type { GraphOperation } from './operations'

export interface OperationLogEntry {
    operation: GraphOperation
    reversalOperations: GraphOperation[]
    timestamp: string
}

export interface OperationLog {
    entries: OperationLogEntry[]
    cursor: number
}

export interface ReflogEntry {
    cursor: number
    previousCursor: number
    timestamp: string
    reason: 'undo' | 'redo' | 'new_operation'
}
