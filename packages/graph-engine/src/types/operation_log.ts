/**
 * operation_log.ts
 *
 * 功能：
 *     定义操作日志与状态标签的类型。两层模型：
 *         - 操作树：细粒度，自动记录每步操作，驱动临时撤销（Ctrl+Z / Ctrl+Y）
 *         - 状态标签：粗粒度，由用户显式提交，驱动历史回顾
 *
 * 总体结构：
 *     1. ItemOperations：按图分组的一批操作（item 的日志形态）
 *     2. OperationLogEntry：单条操作日志（一批正向操作 + 一批逆元 + 图级元数据 + 父节点引用 + 时间戳）
 *     3. OperationLog：操作树本体（entries + cursor）
 *     4. State：用户显式提交的状态标签，指向操作树中的某个 entry
 *
 * 规则：
 *     - parentIndex = -1 表示 entry 直接挂在基线 G₀ 下
 *     - 同一父节点的多个子节点构成分支
 *     - 子节点通过 entries.filter(e => e.parentIndex === cursor) 派生，不显式存储
 *     - State 是对操作树中某个位置的语义标签，不存储 GraphData 副本
 *     - 回退到一个 State = cursor 跳到该 entry，沿 parentIndex 链回放
 *     - 批粒度：一次 commitBatchToGraphs = 一条 entry = 一次回溯单元
 *
 * 外部使用方式：
 *     import type { ItemOperations, OperationLogEntry, OperationLog, State } from '@my-project/graph-engine'
 */

import type { GraphOperation } from './atomic_operations'
import type { GraphId } from './graph_data'

/**
 * 功能：
 *
 *     按图分组的一批操作（item 的日志形态）。graphId 替代运行时 graph 对象，
 *     用于 undo 时按图应用逆元——扁平原子操作（如 delete_node）仅含 nodeId，
 *     无法反推图归属。
 */
export interface ItemOperations {
    graphId: GraphId
    operations: GraphOperation[]
}

/**
 * 功能：
 *
 *     单条操作日志（批粒度）。对应一次 commitBatchToGraphs = 一次回溯单元。
 *
 * 规则：
 *
 *     - operation：一批正向操作，按图分组
 *     - reversalOperations：一批逆元，undo 执行顺序——item 间逆序 + item 内逆序
 *     - graphSignals：图级元数据（新增 / 删除的图）
 *     - source：操作来源的工具标识（如前端 ToolId），可选，缺省表示未知来源
 */
export interface OperationLogEntry {
    operation: ItemOperations[]
    reversalOperations: ItemOperations[]
    graphSignals: { added: GraphId[]; deleted: GraphId[] }
    parentIndex: number
    timestamp: string
    /**
     * 操作来源的工具标识（如前端 ToolId）。
     * 可选——缺省表示未知来源（旧数据兼容）；引擎不做校验，仅为前端渲染分类提供信息。
     */
    source?: string
}

/**
 * 功能：
 *     操作日志树。细粒度，驱动临时撤销。
 *
 * 规则：
 *     - cursor 为当前 entry 的索引。沿 parentIndex 链上溯到根 = 当前历史路径
 *     - Undo：cursor = entries[cursor].parentIndex（单链，无歧义）
 *     - Redo：查子节点。0 子 → 不可前进。1 子 → 自动走。≥2 子 → 前端弹出分支选择
 *     - 新操作：挂在当前 cursor 下。旧分支保留在 entries 中
 */
export interface OperationLog {
    entries: OperationLogEntry[]
    cursor: number
}

/**
 * 功能：
 *     用户显式提交的状态标签。指向操作树中的一个 entry。
 *
 * 规则：
 *     - State 不存储 GraphData 副本，仅存储操作树游标 + 用户摘要
 *     - 恢复一个 State = cursor 跳到 state.cursor，沿 parentIndex 链回放到该 entry
 *     - 回放路径上的所有操作在临时撤销粒度上仍然可逐个 undo/redo
 */
export interface State {
    cursor: number
    summary: string
    timestamp: string
}
