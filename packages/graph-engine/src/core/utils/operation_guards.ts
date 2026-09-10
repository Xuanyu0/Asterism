/**
 * 原子操作判别守卫：把 GraphOperation 联合收窄为图级 / 图内两种形态。
 *
 * @remarks
 * GraphOperation = AtomicOperationInGraph | AtomicGraphOperation，二者以 type 是否
 * 属于图级类型（add_graph / delete_graph / update_graph）区分。图级类型清单在此
 * 单一维护：引擎批级契约校验与前端 operation_guards.ts 均以此为唯一来源，
 * 避免两端重复实现。
 */

import type { AtomicGraphOperation, GraphOperation } from '../../types/atomic_operations'

/**
 * 图级操作类型守卫：收窄 GraphOperation 为 AtomicGraphOperation。
 *
 * @param op - 跨图内 / 图级联合的操作
 * @returns true 表示 op 为图级操作（add_graph / delete_graph / update_graph）。
 */
export function isGraphLevelType(op: GraphOperation): op is AtomicGraphOperation {
    return op.type === 'add_graph' || op.type === 'delete_graph' || op.type === 'update_graph'
}
