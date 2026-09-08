/**
 * 构造单个图级操作的逆元：在操作兑现前调用，捕获操作前注册表状态。
 *
 * @remarks
 * 与 create_reversal_in_graph.ts（图内逆元创建）对称：路由 createGraphReversal 按 type
 * 分派 add_graph / delete_graph / update_graph。操作对象是 GraphRegistry 而非单图——
 * 图级操作是注册表层面的建图 / 删图 / 整图更新。
 * 纯函数：只读注册表，不修改入参。
 */

import type { AtomicGraphOperation, GraphOperation } from '../types/atomic_operations'
import type { GraphRegistry } from '../types/graph_data'

/**
 * 路由逆元构造函数：构造单个图级操作的逆元（类 createReversal 的 switch 分派）。
 *
 * @remarks
 * 在操作兑现前调用（注册表仍是操作前状态），统一签名 { type, graph }：
 * - add_graph 逆元 = delete_graph（携带 op.graph 空图骨架）
 * - delete_graph 逆元 = add_graph（op.graph 即被删空图骨架，内容由 redo 图内操作重放重建）
 * - update_graph 逆元 = 同型操作，携带操作前旧图全量（含旧 title / createdAt / updatedAt，undo 时整图回退）
 * add / delete 分支不读取 registryBefore；
 * registryBefore 仅供 update_graph 捕获旧图。
 *
 * @param registryBefore - 操作前注册表（update_graph 旧图快照来源）
 * @param op - 图级操作
 * @returns 逆元操作序列（update_graph 未命中目标时返回空序列）。
 */
export function createGraphReversal(registryBefore: GraphRegistry, op: AtomicGraphOperation): GraphOperation[] {
    switch (op.type) {
        case 'add_graph':
            // add_graph 逆元 = delete_graph（携带图数据，签名统一）
            return [{ type: 'delete_graph', graph: op.graph }]
        case 'delete_graph':
            // delete_graph 逆元 = add_graph（op.graph 即被删空图骨架）
            return [{ type: 'add_graph', graph: op.graph }]
        case 'update_graph': {
            // update_graph 逆元 = 同型操作，携带操作前旧图（validate 已保证命中，此处防御未命中）
            const oldGraph = registryBefore.get(op.graph.id)

            return oldGraph ? [{ type: 'update_graph', graph: oldGraph }] : []
        }
    }
}
