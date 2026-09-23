/**
 * 批量提交入口：一次接收「新增 / 更新哪些图 + 删除哪些图」。
 *
 * @remarks
 * 取代旧 graph_store 里「推导 affectedGraphIds → 逐图 save / delete」的循环。
 *
 * 失败边界（P1 如实边界）：
 * 1. 写入失败返回可判别结果，调用方据此**不推进内存状态**——只保护本次会话。
 * 2. 已写成功的条目**不撤销**，磁盘可能留下「既非旧状态、也非新状态」的半写态。
 * 3. 下次启动直接读磁盘，会把半写态**读成基线**——不一致被静默合法化。
 * 4. 真原子性需要介质事务，由 P2 的 IndexedDB 承担；本步骤不改写入行为。
 *
 * 本步骤只含图数据一支；P3 操作日志加入后，跨类别原子性也收口于此。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { persistGraphEntry, removeGraphEntry, serializeGraphs } from '../categories/graph_data'

import type { WriteResult } from '../medium/local_storage'

/**
 * 一次图数据变更的形状（层内类型，不导出出 persistence/）。
 */
export interface GraphDataChange {
    /** 新增或更新的图（同 id 覆盖）。 */
    upserts: GraphData[]

    /** 要删除的图 id；对应图不存在不是错误。 */
    deletes: GraphId[]
}

/**
 * 提交一次图数据变更。
 *
 * @remarks
 * 本地存储无事务，以「先全量序列化、再逐条写、任一失败即回报」近似「同成同败」：
 * 序列化在内存中一次完成，写阶段遇失败立刻返回，不再继续写后续条目。
 *
 * @param change - 本次的 upserts 与 deletes
 * @returns 全部写入成功 `{ ok: true }`；否则首个失败的 reason。
 */
export function commitGraphs(change: GraphDataChange): WriteResult {
    const entries = serializeGraphs(change.upserts)

    for (const entry of entries) {
        const result = persistGraphEntry(entry)
        if (!result.ok) return result
    }

    for (const graphId of change.deletes) {
        const result = removeGraphEntry(graphId)
        if (!result.ok) return result
    }

    return { ok: true }
}
