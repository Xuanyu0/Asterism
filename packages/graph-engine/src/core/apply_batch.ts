/**
 * 单图操作序列事务流水线。
 *
 * @remarks
 * 是全部 GraphData 修改的唯一入口。
 *
 * 三阶段事务：
 * 1. Phase 1：逐条校验操作前提
 * 2. Phase 2：dry-run execute 全部操作
 * 3. Phase 3：对结果图运行不变量规则
 *
 * 任一阶段失败整批丢弃（graph 原封不动，返回全部 issue）——不存在"执行一半回滚"的场景，
 * 全通过后才开始 execute。
 *
 * 其他契约：
 * - 纯函数，不内部调用 createReversalInGraph（逆元构造时机由上层决定）
 * - 时间戳来源由 options.executedAt 从前端统一传入
 */

import type { GraphData } from '../types/graph_data'
import type { AtomicOperationInGraph } from '../types/atomic_operations'
import type { ValidationResult } from '../types/validation'
import type { PreferenceRulesTable } from './rules/invariants/preference_rules_table'

import { executeOperation } from './execute_operation_in_graph'
import { validateOperationInGraph } from './rules/preconditions/in_graph'
import { checkInvariants } from './rules/invariants/check_invariants'
import { DEFAULT_PREFERENCE_RULES_TABLE } from './rules/invariants/preference_rules_table'

/**
 * 批处理配置。
 */
export interface BatchOptions {
    /** 时间戳来源（必传）。语义 = 本批次执行的时刻；对象级时间戳兜底值与图级 updatedAt 均取此值。 */
    executedAt: string

    /** 只校验不执行（默认 false）。用于认知操作正式执行前预判。 */
    dryRun?: boolean

    /** 遇第一个失败即停。默认 false——聚合所有 issue。 */
    stopOnFirst?: boolean

    /**
     * 偏好规则开关表：只作用于偏好规则（标签 / 摘要长度、节点数、虚邻居数），
     * 硬性不变量恒跑、不受本表影响（缺席配置面）。缺省 DEFAULT_PREFERENCE_RULES_TABLE（7 个偏好 code 全开）。
     */
    preferenceRulesTable?: PreferenceRulesTable

    /**
     * 每原子操作执行前的回调。在逐操作执行循环（Phase 2）中、executeOperation
     * 之前调用，入参为该操作与其执行前的图状态（中间态）。未传时不调用（零行为变化）。
     */
    onBeforeEachOperation?: (op: AtomicOperationInGraph, graphBeforeOp: GraphData) => void

    /**
     * 跳过 Phase 1 逐条前提校验（默认 false）。preview 占位预览专用：占位节点空 label
     * 会被 Phase 1 EMPTY_LABEL（UX 前置）拒绝，故预览模拟时跳过前提校验（⑤ 迁出后
     * 整体退役）。跳过校验后 execute 仍逐操作顺序执行（依赖由操作内部顺序保证），
     * Phase 3 不变量规则仍运行。
     */
    skipValidate?: boolean
}

/** 单个操作的批处理结果。 */
export interface PerOpResult {
    /** 原始操作。 */
    operation: AtomicOperationInGraph

    /** 该操作的校验结果。 */
    validation: ValidationResult
}

/** applyBatch 的返回值。 */
export interface BatchResult {
    /** 操作后的图。dryRun 或校验失败时与入参 graph 相同。 */
    graph: GraphData

    /** 聚合后的总体校验结果。valid = true 表示全部通过。 */
    validation: ValidationResult

    /** 每个操作的独立结果。保留此级别以支持前端逐项展示。 */
    results: PerOpResult[]
}

/**
 * 批量事务执行：逐条 validate → 全通过后逐条 execute → 不变量校验。
 *
 * @remarks
 * validate-all-first：全部校验通过后才开始 execute。任一阶段失败返回原图 + 聚合
 * issues；不内部调用 createReversalInGraph（reversal 由上层管理）；不变量规则在 Phase 3
 * 对结果图统一运行，不依赖操作类型。
 *
 * @param graph - 操作前的 GraphData 快照
 * @param ops - 待执行的操作序列
 * @param options - 批处理配置（executedAt 必传；其余 dryRun / stopOnFirst / preferenceRulesTable / onBeforeEachOperation / skipValidate 可选）
 * @returns 新图 + 聚合校验 + 每操作独立结果。
 */
export function applyBatch(graph: GraphData, ops: AtomicOperationInGraph[], options: BatchOptions): BatchResult {
    const executedAt = options.executedAt
    const dryRun = options.dryRun ?? false
    const stopOnFirst = options.stopOnFirst ?? false
    const skipValidate = options.skipValidate ?? false
    const preferenceRulesTable = options.preferenceRulesTable ?? DEFAULT_PREFERENCE_RULES_TABLE

    // Phase 1 — 逐条校验操作前提条件
    // skipValidate（preview 占位预览专用）：跳过全部前提校验，直接 Phase 2——
    // 占位节点空 label 会被 EMPTY_LABEL（UX 前置）拒绝（⑤ 迁出后该参数整体退役）
    const results: PerOpResult[] = []

    if (!skipValidate) {
        for (const op of ops) {
            const validation = validateOperationInGraph(graph, op)

            results.push({ operation: op, validation })

            if (!validation.valid && stopOnFirst) break
        }
    }

    const preconditionsIssues = results.flatMap((r) => r.validation.issues)
    const hasLocalFailure = results.some((r) => !r.validation.valid)

    if (hasLocalFailure) {
        return {
            graph,
            validation: { valid: false, issues: preconditionsIssues },
            results,
        }
    }

    // Phase 2 — dry-run execute 全部操作，得到 resultGraph
    let resultGraph = graph

    for (const op of ops) {
        // 逐操作挂点：入参为 op 执行前的中间态，不改变执行结果
        options.onBeforeEachOperation?.(op, resultGraph)
        resultGraph = executeOperation(resultGraph, op, executedAt)
    }

    // Phase 3 — 对 resultGraph 运行不变量规则
    const invariantIssues = checkInvariants(resultGraph, preferenceRulesTable)
    const hasInvariantFailure = invariantIssues.some((issue) => issue.severity === 'error')

    if (hasInvariantFailure) {
        return {
            graph,
            validation: {
                valid: false,
                issues: [...preconditionsIssues, ...invariantIssues],
            },
            results,
        }
    }

    // dryRun 模式：校验通过但不执行
    if (dryRun) {
        return {
            graph,
            validation: {
                valid: true,
                issues: [...preconditionsIssues, ...invariantIssues],
            },
            results,
        }
    }

    return {
        graph: resultGraph,
        validation: { valid: true, issues: [] },
        results,
    }
}
