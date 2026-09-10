/**
 * 原子操作判别守卫：把 AtomicOperation 联合收窄为图内 / 图级两种形态。
 *
 * @remarks
 * AtomicOperation = AtomicOperationInGraph | AtomicGraphOperation，二者以 type 是否
 * 属于图级类型（add_graph / delete_graph / update_graph）区分。applyBatches 的
 * OperationBatch 是判别联合，提交前需把混合的 AtomicOperation[] 拆成独立批，
 * 这两个守卫提供统一收窄逻辑。
 * 图级类型清单的唯一来源是引擎 `isGraphLevelType`——本模块将其 re-export 为域内别名
 * `isGraphLevelOperation`（保持既有调用方不变），前端不再维护重复实现。
 */

import { isGraphLevelType } from '@my-project/graph-engine'

import type { AtomicOperationInGraph, AtomicOperation } from '@my-project/graph-engine'

/** 图级操作类型守卫（引擎 `isGraphLevelType` 的域内别名）。 */
export { isGraphLevelType as isGraphLevelOperation }

/**
 * 图内操作类型守卫：收窄 AtomicOperation 为 AtomicOperationInGraph。
 *
 * @remarks
 * 基于 isGraphLevelType 取反：图级类型清单只维护一处，新增图级操作不会漏同步。
 *
 * @param op - 待判别操作
 * @returns true 表示 op 为图内操作（非图级类型）。
 */
export function isInGraphOperation(op: AtomicOperation): op is AtomicOperationInGraph {
    return !isGraphLevelType(op)
}
