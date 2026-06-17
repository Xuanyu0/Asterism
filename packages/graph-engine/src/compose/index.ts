/**
 * compose/index.ts
 *
 * 功能：
 *     compose 层统一出口。Step 7（arrangement）和 Step 8（cognitive）
 *     的模块由对应 Step 填充。被 engine/src/index.ts re-export。
 *
 * 当前：
 *     - 基础类型和 pipeline（Step 6）
 *     - arrangement/ 和 cognitive/ 留空（Step 7 / Step 8）
 */

export type { DraftPosition, ComposeIssue, ComposeResult } from './types'

export { applyBatch } from './pipeline'
export type { BatchOptions, PerOpResult, BatchResult } from './pipeline'
