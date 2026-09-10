/**
 * 多图批处理：统一循环执行图内与图级操作。
 *
 * @remarks
 * 统一循环（融合而非拼接）：逐批遍历，按 kind if-else 直接分派，禁止
 * "图内先执行、图级后兑现"的两段式拼接：
 * - 图内批：委托 applyBatch 执行
 * - 图级批：先 validateGraphOperation 校验再路由兑现
 *
 * 纯函数：不修改入参注册表，返回新 GraphRegistry（复用未变化图引用，不深拷贝）。
 *
 * 逆元构造：
 * - 图内：经 createReversal（执行前捕获操作前状态）
 * - 图级：经 createGraphReversal（执行前捕获操作前注册表状态）——
 *   add ↔ delete 互逆；update 以同型操作携带旧图全量；签名统一为操作图数据 { type, graph }
 *
 * 事务性：任一操作校验失败整批丢弃，注册表不变。
 */

import type { GraphData, GraphId, GraphRegistry } from '../types/graph_data'
import type { GraphOperation } from '../types/atomic_operations'
import type { ValidationIssue, ValidationResult } from '../types/validation'
import type { BatchesLog } from '../types/operation_log'
import type { OperationBatch } from '../types/compose_types'
import { applyBatch } from './apply_batch'
import { createGraphReversal } from './create_graph_reversal'
import { createReversalInGraph } from './create_reversal_in_graph'
import { executeGraphOperation } from './execute_graph_operation'
import { validateGraphOperation } from './rules/preconditions/graph_level'

/**
 * applyBatches 的返回值。
 */
export interface ApplyBatchesResult {
    /** 操作后的新注册表。校验失败时与入参注册表相同（整批丢弃）。 */
    registry: GraphRegistry

    /** 聚合后的总体校验结果。valid = true 表示全部通过。 */
    validation: ValidationResult

    /** 逆元序列，按批分组（item 间逆序，item 内逆序打平）。 */
    reversalBatches: BatchesLog[]
}

/**
 * applyBatches 的配置。
 */
export interface ApplyBatchesOptions {
    /** 时间戳来源（必传），透传 applyBatch / executeOperation。语义 = 本批次执行的时刻。 */
    executedAt: string

    /** 透传 applyBatch，跳过 Phase 1 前提校验（preview 占位预览专用，⑤ 迁出后退役）。 */
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
 *   delete_graph 注销 / update_graph 整图替换），逆元经 createGraphReversal 构造。
 *
 * 事务性：任一操作校验失败整批丢弃，返回入参注册表（不变）。
 *
 * @param registry - 操作前的多图注册表（不修改）
 * @param batches - 多批次操作（图内 / 图级判别联合）
 * @param options - 配置（executedAt 必传；skipValidate / recordLog 可选）
 * @returns 新注册表 + 聚合校验 + 逆元序列。
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
    const reversalItems: BatchesLog[] = []

    for (const batch of batches) {
        // 批级契约校验：批内操作类型必须与批的 kind 一致（判别联合已收窄 operations，
        // 此处经 as GraphOperation 检查运行时实际类型，防御 as 断言绕过 / 构造方错误）
        const hasKindMismatch =
            batch.kind === 'inGraph'
                ? batch.operations.some((op) => isGraphLevelType(op as GraphOperation))
                : batch.operations.some((op) => !isGraphLevelType(op as GraphOperation))
        if (hasKindMismatch) {
            return aborted(registry, { valid: false, issues: [buildKindMismatchIssue(batch)] })
        }

        if (batch.kind === 'inGraph') {
            // 图内批
            // 图内批操作对象（图）必须存在：防止操作构造方对不存在的图操作被隐式创建
            if (!newRegistry.has(batch.graph.id)) {
                return aborted(registry, {
                    valid: false,
                    issues: [buildBatchGraphNotFoundIssue(batch.graph.id)],
                })
            }

            // 图内批：委托 applyBatch（单图批事务）
            const inputGraph = latestGraphs.get(batch.graph.id) ?? batch.graph
            const perOpReversals: GraphOperation[][] = []

            const { graph, validation } = applyBatch(inputGraph, batch.operations, {
                executedAt,
                skipValidate,
                onBeforeEachOperation:
                    recordLog === false
                        ? undefined // undo/redo 执行时不收集逆元（日志已有）
                        : (op, graphBeforeOp) => {
                              perOpReversals.push(createReversalInGraph(graphBeforeOp, op))
                          },
            })

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
            // 图级批：for 循环内逐 op 校验 → 构造逆元 → 兑现
            // （逆元须在兑现前构造：此时注册表仍是操作前状态）
            for (const op of batch.operations) {
                // 图级操作局部规则校验（rules/preconditions/graph_level 单 op）
                const validation = validateGraphOperation(newRegistry, op)
                if (!validation.valid) {
                    // 事务性：任一图级操作校验失败整批丢弃，注册表不变
                    return aborted(registry, validation)
                }

                if (recordLog) {
                    // 执行前构造逆元：update_graph 需要操作前旧图全量（执行后即被替换丢失）
                    const reversal = createGraphReversal(newRegistry, op)
                    if (reversal.length > 0) {
                        reversalItems.push({
                            graphId: op.graph.id,
                            operations: reversal,
                        })
                    }
                }

                // 纯函数：输入注册表 + 操作 → 输出新注册表（引用替换）
                newRegistry = executeGraphOperation(newRegistry, op, executedAt)

                if (op.type === 'add_graph' || op.type === 'update_graph') {
                    // 同步操作后的注册图：同图后续 inGraph 批基于它执行（如 add_graph 补写的时间戳 / update_graph 替换的字段）
                    latestGraphs.set(op.graph.id, newRegistry.get(op.graph.id)!)
                }
            }
        }
    }

    return {
        registry: newRegistry,
        validation: { valid: true, issues: allIssues },
        reversalBatches: reversalItems.reverse(), // item 间逆序
    }
}

// ═══════════ 批级契约辅助 ═══════════

/**
 * 批级类型判别：操作是否为图级操作。
 *
 * @param op - 跨图内 / 图级联合的操作（运行时经 as 断言检查）
 * @returns 图级操作（add_graph / delete_graph / update_graph）返回 true。
 */
function isGraphLevelType(op: GraphOperation): boolean {
    return op.type === 'add_graph' || op.type === 'delete_graph' || op.type === 'update_graph'
}

/**
 * 事务性中断的统一返回：保留入参注册表（整批丢弃），清空逆元。
 *
 * @param registry - 入参注册表（不变，直接回传）
 * @param validation - 导致中断的校验结果
 * @returns 中断态的 ApplyBatchesResult。
 */
function aborted(registry: GraphRegistry, validation: ValidationResult): ApplyBatchesResult {
    return {
        registry,
        validation,
        reversalBatches: [],
    }
}

// ═══════════ 错误消息构造 ═══════════

/**
 * 批级契约不一致的校验 issue 构造：批内操作类型与批的 kind 不匹配。
 *
 * @param batch - kind 与操作类型不一致的批次
 * @returns BATCH_KIND_MISMATCH 错误 issue
 */
function buildKindMismatchIssue(batch: OperationBatch): ValidationIssue {
    return {
        severity: 'error',
        code: 'BATCH_KIND_MISMATCH',
        message: `批次 kind 与操作类型不一致：${batch.kind} 批包含 ${
            batch.kind === 'inGraph' ? '图级操作' : '图内操作'
        }`,
        targetType: 'graph',
        targetId: batch.kind === 'inGraph' ? batch.graph.id : (batch.operations[0]?.graph.id ?? ''),
    }
}

/**
 * 图内批目标图不存在的校验 issue 构造。
 *
 * @param graphId - 目标图 ID
 * @returns BATCH_GRAPH_NOT_FOUND 错误 issue
 */
function buildBatchGraphNotFoundIssue(graphId: GraphId): ValidationIssue {
    return {
        severity: 'error',
        code: 'BATCH_GRAPH_NOT_FOUND',
        message: `图内批操作的目标图不存在：${graphId}`,
        targetType: 'graph',
        targetId: graphId,
    }
}
