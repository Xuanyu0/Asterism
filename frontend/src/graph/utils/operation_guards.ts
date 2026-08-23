/**
 * 原子操作判别守卫：把 GraphOperation 联合收窄为图内 / 图级两种形态。
 *
 * @remarks
 * GraphOperation = AtomicOperationInGraph | AtomicGraphOperation，二者以 type 是否
 * 属于 add_graph / delete_graph 区分。applyBatches 的 OperationBatch 是判别联合，
 * 提交前需把混合的 GraphOperation[] 拆成独立批，这两个守卫提供统一收窄逻辑。
 */

import type {
    AtomicGraphOperation,
    AtomicOperationInGraph,
    GraphOperation,
} from '@my-project/graph-engine'

/**
 * 图内操作类型守卫：收窄 GraphOperation 为 AtomicOperationInGraph。
 *
 * @param op - 待判别操作
 * @returns true 表示 op 为图内操作（非 add_graph / delete_graph）。
 */
export function isInGraphOperation(
    op: GraphOperation,
): op is AtomicOperationInGraph {
    return op.type !== 'add_graph' && op.type !== 'delete_graph'
}

/**
 * 图级操作类型守卫：收窄 GraphOperation 为 AtomicGraphOperation。
 *
 * @param op - 待判别操作
 * @returns true 表示 op 为图级操作（add_graph / delete_graph）。
 */
export function isGraphLevelOperation(
    op: GraphOperation,
): op is AtomicGraphOperation {
    return op.type === 'add_graph' || op.type === 'delete_graph'
}
