/**
 * 执行图级原子操作：把单个图级操作应用到多图注册表，返回新注册表。
 *
 * @remarks
 * 与 execute_operation_in_graph.ts（图内执行）对称：路由 executeGraphOperation 按 type
 * 分派到各 case 单一函数（executeAddGraph / executeDeleteGraph / executeUpdateGraph）。
 * 操作对象是 GraphRegistry 而非单图——图级操作是注册表层面的建图 / 删图 / 整图更新。
 * 纯函数：引用替换返回新注册表，不修改入参；未变化图复用引用，不深拷贝。
 *
 * 时间戳由调用方（applyBatches）经裸参数 executedAt 传入，本模块不自行生成：
 * - add_graph：图骨架未携带时间戳时补写 executedAt
 * - update_graph：createdAt / updatedAt 携带值优先（carried ?? executedAt，参照 update_node）
 */

import type {
    AddGraphOperation,
    AtomicGraphOperation,
    DeleteGraphOperation,
    UpdateGraphOperation,
} from '../types/atomic_operations'
import type { GraphRegistry } from '../types/graph_data'

/**
 * 路由函数：兑现单个图级操作（类 executeOperation 的 switch 分派，纯函数）。
 *
 * @remarks
 * 输入注册表 + 图级操作 → 输出新注册表（引用替换，不修改入参）。
 *
 * @param registry - 操作前的注册表（不修改）
 * @param op - 待兑现的图级操作
 * @param executedAt - 本批次执行的时刻（add_graph / update_graph 时间戳来源）
 * @returns 新注册表（引用替换，未变化图复用引用）
 */
export function executeGraphOperation(
    registry: GraphRegistry,
    op: AtomicGraphOperation,
    executedAt: string,
): GraphRegistry {
    switch (op.type) {
        case 'add_graph':
            return executeAddGraph(registry, op, executedAt)

        case 'delete_graph':
            return executeDeleteGraph(registry, op)

        case 'update_graph':
            return executeUpdateGraph(registry, op, executedAt)
    }
}

// ═══════════ 各 case 单一函数 ═══════════

function executeAddGraph(registry: GraphRegistry, op: AddGraphOperation, executedAt: string): GraphRegistry {
    // add_graph 只注册空图：顺序由操作构造方保证（add_graph 批在填充批之前）
    const next = new Map(registry)
    // 图骨架未携带时间戳时补写 executedAt（已携带则尊重并复用原引用）
    const graph =
        op.graph.createdAt === undefined || op.graph.updatedAt === undefined
            ? {
                  ...op.graph,
                  createdAt: op.graph.createdAt ?? executedAt,
                  updatedAt: op.graph.updatedAt ?? executedAt,
              }
            : op.graph
    next.set(op.graph.id, graph)
    return next
}

function executeDeleteGraph(registry: GraphRegistry, op: DeleteGraphOperation): GraphRegistry {
    const next = new Map(registry)
    next.delete(op.graph.id)
    return next
}

function executeUpdateGraph(registry: GraphRegistry, op: UpdateGraphOperation, executedAt: string): GraphRegistry {
    // 整图替换：以操作携带的 graph 全量字段建新对象（update_node 式）
    const next = new Map(registry)
    next.set(op.graph.id, {
        ...op.graph,
        // 时间戳携带值优先：正操作不携带 → executedAt 刷新；逆元携带旧图 → undo 恢复历史时刻
        createdAt: op.graph.createdAt ?? executedAt,
        updatedAt: op.graph.updatedAt ?? executedAt,
    })
    return next
}
