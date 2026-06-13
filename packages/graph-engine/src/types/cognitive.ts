/**
 * cognitive.ts
 *
 * 功能：
 *     定义认知操作返回值的类型。
 *
 * 总体结构：
 *     1. CognitiveResult：认知操作返回的操作序列 + 元信息
 *
 * 外部使用方式：
 *     import type { CognitiveResult } from '@my-project/graph-engine'
 */

import type { GraphOperation } from './operations'

/**
 * 功能：
 *     认知操作（deconstruct / induce / internalize / diverge）的统一返回类型。
 *
 * 规则：
 *     - operations：原子操作序列，调用方逐条 apply() 或 applyBatch()（Phase 3）执行
 *     - metadata：Phase 3 AI Collabrator 可追加置信度、推理过程等元信息
 */
export interface CognitiveResult {
    operations: GraphOperation[]
    metadata?: Record<string, unknown>
}
