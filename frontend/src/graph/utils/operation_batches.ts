/**
 * 把一组原子操作拆成 applyBatches 可消费的判别联合批序列。
 *
 * @remarks
 * 图级批必须排在图内批之前：applyBatches 依赖该顺序先兑现注册表副作用
 * （如 add_graph），图内批才能解析到目标图。仅对应类别存在操作时才产出批次。
 */

import type { AtomicOperation, GraphData, OperationBatch } from '@my-project/graph-engine'

import { isGraphLevelType, isInGraphType } from '@my-project/graph-engine'

/**
 * 将混合的原子操作序列拆分为图级批 + 图内批。
 *
 * @param operations - 图内 / 图级混合的原子操作序列
 * @param graph - 图内批的目标图
 * @returns graphLevel 批在前、inGraph 批在后的序列；无操作的类别不产出批次
 */
export function splitOperationsIntoBatches(operations: AtomicOperation[], graph: GraphData): OperationBatch[] {
    const graphLevelOps = operations.filter(isGraphLevelType)
    const inGraphOps = operations.filter(isInGraphType)

    const batches: OperationBatch[] = []
    if (graphLevelOps.length > 0) {
        batches.push({ kind: 'graphLevel', operations: graphLevelOps })
    }
    if (inGraphOps.length > 0) {
        batches.push({ kind: 'inGraph', graph, operations: inGraphOps })
    }
    return batches
}
