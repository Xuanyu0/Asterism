/**
 * 多图批处理（多图管理层）：统一循环执行图内（委托 applyBatch）与图级
 * （add_graph / delete_graph 兑现）操作，返回新注册表 + 聚合校验 + 逆元序列 + graphSignals。
 *
 * @remarks
 * 统一循环（融合而非拼接）：逐批遍历，按 kind if-else 直接分派——图内委托 applyBatch、
 * 图级先 validateGraphOperation 校验再路由兑现，禁止"图内先执行、图级后兑现"的两段式拼接。
 * 纯函数：不修改入参注册表，返回新 GraphRegistry（复用未变化图引用，不深拷贝）。
 * 逆元：图内经 createReversal 构造（执行前捕获操作前状态）；图级经路由逆元构造函数
 * 构造（add ↔ delete 互逆，签名统一为操作图数据 { type, graph }）。
 * 事务性：任一操作校验失败整批丢弃，注册表不变。
 */

import type { GraphData, GraphId, GraphRegistry } from '../types/graph_data'
import type {
    AtomicGraphOperation,
    GraphOperation,
} from '../types/atomic_operations'
import type { ValidationIssue, ValidationResult } from '../types/validation'
import type { ItemOperations } from '../types/operation_log'
import type { OperationBatch } from '../types/compose_types'
import { applyBatch } from './apply_batch'
import { createReversal } from './reversal'
import { validateGraphOperation } from './validate_graph_operation'

/**
 * 图级摘要：本批新增 / 删除的图 ID。
 *
 * @remarks
 * 中间态，供 07 操作日志改造前的现状日志组装使用，07 移除。
 */
export interface GraphSignals {
    added: GraphId[]
    deleted: GraphId[]
}

/**
 * applyBatches 的返回值。
 */
export interface ApplyBatchesResult {
    /** 操作后的新注册表。校验失败时与入参注册表相同（整批丢弃）。 */
    registry: GraphRegistry

    /** 聚合后的总体校验结果。valid = true 表示全部通过。 */
    validation: ValidationResult

    /** 逆元序列，按批分组（item 间逆序，item 内逆序打平）。 */
    reversalOperations: ItemOperations[]

    /** 图级摘要（中间态，07 移除）。 */
    graphSignals: GraphSignals
}

/**
 * applyBatches 的配置。
 */
export interface ApplyBatchesOptions {
    /** 时间戳来源（必传），透传 applyBatch / executeOperation。语义 = 本批次执行的时刻。 */
    executedAt: string

    /** 透传 applyBatch，跳过 Phase 1 前提校验（undo/redo 恢复型逆元批传 true）。 */
    skipValidate?: boolean

    /** 是否收集逆元（默认 true）。undo/redo 执行（recordLog: false）不收集。 */
    recordLog?: boolean
}

/**
 * 多图批处理：统一循环执行多批次操作。
 *
 * @remarks
 * 逐批遍历，按 kind if-else 直接分派（单循环，融合而非拼接）：
 * - inGraph 批：委托 applyBatch（单图批事务）执行，逆元经 createReversal 构造；
 * - graphLevel 批：经路由函数 executeGraphOperation 兑现（add_graph 注册 /
 *   delete_graph 注销），逆元经路由逆元构造函数 createGraphReversal 构造。
 *
 * 事务性：任一操作校验失败整批丢弃，返回入参注册表（不变）。
 *
 * @param registry - 操作前的多图注册表（不修改）
 * @param batches - 多批次操作（图内 / 图级判别联合）
 * @param options - 配置（executedAt 必传；skipValidate / recordLog 可选）
 * @returns 新注册表 + 聚合校验 + 逆元序列 + graphSignals。
 */
export function applyBatches(
    registry: GraphRegistry,
    batches: OperationBatch[],
    options: ApplyBatchesOptions,
): ApplyBatchesResult {
    const executedAt = options.executedAt
    const skipValidate = options.skipValidate ?? false
    const recordLog = options.recordLog ?? true

    // 纯函数：构建新 Map（复用未变化图引用，不深拷贝），失败时丢弃返回入参
    let newRegistry = new Map(registry)

    // 同一图被多个批修改时，后续基于前一个操作后图数据的结果
    const latestGraphs = new Map<GraphId, GraphData>()

    const allIssues: ValidationIssue[] = []
    const reversalItems: ItemOperations[] = []
    const graphSignals: GraphSignals = { added: [], deleted: [] }

    for (const batch of batches) {
        // 批级契约校验：批内操作类型必须与批的 kind 一致（图级独立成批由执行前校验强制）。
        // 判别联合类型已收窄 operations，此处经 as GraphOperation 检查运行时实际类型
        // （防御 as 断言绕过 / 构造方错误）。
        const hasKindMismatch =
            batch.kind === 'inGraph'
                ? batch.operations.some(
                      (op) =>
                          (op as GraphOperation).type === 'add_graph' ||
                          (op as GraphOperation).type === 'delete_graph',
                  )
                : batch.operations.some(
                      (op) =>
                          (op as GraphOperation).type !== 'add_graph' &&
                          (op as GraphOperation).type !== 'delete_graph',
                  )
        if (hasKindMismatch) {
            return aborted(registry, {
                valid: false,
                issues: [
                    {
                        severity: 'error',
                        code: 'BATCH_KIND_MISMATCH',
                        message: `批次 kind 与操作类型不一致：${batch.kind} 批包含 ${
                            batch.kind === 'inGraph' ? '图级操作' : '图内操作'
                        }`,
                        targetType: 'graph',
                        targetId:
                            batch.kind === 'inGraph'
                                ? batch.graph.id
                                : (batch.operations[0]?.graph.id ?? ''),
                    },
                ],
            })
        }

        if (batch.kind === 'inGraph') {
            // 图内批操作对象（图）必须存在：防止操作构造方对不存在的图操作被隐式创建
            if (!newRegistry.has(batch.graph.id)) {
                return aborted(registry, {
                    valid: false,
                    issues: [
                        {
                            severity: 'error',
                            code: 'BATCH_GRAPH_NOT_FOUND',
                            message: `图内批操作的目标图不存在：${batch.graph.id}`,
                            targetType: 'graph',
                            targetId: batch.graph.id,
                        },
                    ],
                })
            }

            // 图内批：委托 applyBatch（单图批事务）
            const inputGraph = latestGraphs.get(batch.graph.id) ?? batch.graph
            const perOpReversals: GraphOperation[][] = []

            const { graph, validation } = applyBatch(
                inputGraph,
                batch.operations,
                {
                    executedAt,
                    skipValidate,
                    onBeforeEachOperation:
                        recordLog === false
                            ? undefined // undo/redo 执行时不收集逆元（日志已有）
                            : (op, graphBeforeOp) => {
                                  perOpReversals.push(
                                      createReversal(graphBeforeOp, op),
                                  )
                              },
                },
            )

            if (!validation.valid) {
                // 事务性：任一操作校验失败整批丢弃，注册表不变
                return aborted(registry, validation)
            }

            allIssues.push(...validation.issues)
            latestGraphs.set(batch.graph.id, graph)
            newRegistry.set(batch.graph.id, graph)

            // 收尾：单次图内批逆元收集（item 内逆序打平）
            if (recordLog && perOpReversals.length > 0) {
                reversalItems.push({
                    graphId: batch.graph.id,
                    operations: perOpReversals.reverse().flat(),
                })
            }
        } else {
            // 图级批：for 循环内边校验边执行（逐 op：validateGraphOperation → executeGraphOperation）
            for (const op of batch.operations) {
                // 图级操作局部规则校验（validate_graph_operation 单 op）
                const validation = validateGraphOperation(newRegistry, op)
                if (!validation.valid) {
                    // 事务性：任一图级操作校验失败整批丢弃，注册表不变
                    return aborted(registry, validation)
                }

                // 纯函数：输入注册表 + 操作 → 输出新注册表（引用替换）
                newRegistry = executeGraphOperation(newRegistry, op)

                // 图级摘要累积（由调用方从操作类型推导）
                if (op.type === 'add_graph') {
                    graphSignals.added.push(op.graph.id)
                } else {
                    graphSignals.deleted.push(op.graph.id)
                }

                if (recordLog) {
                    const reversal = createGraphReversal(op)
                    if (reversal.length > 0) {
                        reversalItems.push({
                            graphId: op.graph.id,
                            operations: reversal,
                        })
                    }
                }
            }
        }
    }

    return {
        registry: newRegistry,
        validation: { valid: true, issues: allIssues },
        reversalOperations: reversalItems.reverse(), // item 间逆序
        graphSignals,
    }
}

// ═══════════ 路由函数 ═══════════

/**
 * 路由函数：兑现单个图级操作（类 executeOperation 的 switch 分派，纯函数）。
 *
 * @remarks
 * 输入注册表 + 图级操作 → 输出新注册表（引用替换，不修改入参）。
 * add_graph 直接注册操作自带的空图——顺序由操作构造方（compose）保证：
 * add_graph 批在对应子图填充批之前，注册空图后由后续图内批填充覆盖。
 * 图级摘要（graphSignals）由调用方从操作类型推导累积。
 *
 * @param registry - 操作前的注册表（不修改）
 * @param op - 待兑现的图级操作
 * @returns 新注册表（引用替换，未变化图复用引用）
 */
function executeGraphOperation(
    registry: GraphRegistry,
    op: AtomicGraphOperation,
): GraphRegistry {
    switch (op.type) {
        case 'add_graph': {
            // add_graph 只注册空图：顺序由操作构造方保证（add_graph 批在填充批之前）
            const next = new Map(registry)
            next.set(op.graph.id, op.graph)
            return next
        }
        case 'delete_graph': {
            const next = new Map(registry)
            next.delete(op.graph.id)
            return next
        }
    }
}

// ═══════════ 路由逆元构造函数 ═══════════

/**
 * 路由逆元构造函数：构造单个图级操作的逆元（类 createReversal 的 switch 分派）。
 *
 * @remarks
 * add_graph ↔ delete_graph 互逆，签名统一为操作图数据（{ type, graph }）：
 * - add_graph 逆元 = delete_graph（携带 op.graph 空图骨架）
 * - delete_graph 逆元 = add_graph（op.graph 即被删空图骨架，内容由 redo 图内操作重放重建）
 *
 * @param op - 图级操作
 * @returns 逆元操作序列
 */
function createGraphReversal(op: AtomicGraphOperation): GraphOperation[] {
    switch (op.type) {
        case 'add_graph':
            // add_graph 逆元 = delete_graph（携带图数据，签名统一）
            return [{ type: 'delete_graph', graph: op.graph }]
        case 'delete_graph':
            // delete_graph 逆元 = add_graph（op.graph 即被删空图骨架）
            return [{ type: 'add_graph', graph: op.graph }]
    }
}

/**
 * 事务性中断的统一返回：保留入参注册表（整批丢弃），清空逆元与图级摘要。
 *
 * @param registry - 入参注册表（不变，直接回传）
 * @param validation - 导致中断的校验结果
 * @returns 中断态的 ApplyBatchesResult。
 */
function aborted(
    registry: GraphRegistry,
    validation: ValidationResult,
): ApplyBatchesResult {
    return {
        registry,
        validation,
        reversalOperations: [],
        graphSignals: { added: [], deleted: [] },
    }
}
