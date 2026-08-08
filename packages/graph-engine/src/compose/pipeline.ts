/**
 * pipeline.ts
 *
 * 功能：
 *
 *     操作序列事务流水线。所有 GraphData 修改的唯一入口。
 *
 * 总体结构：
 *
 *     1. applyBatch         — 事务流水线（全通过→执行，任一失败→丢弃）
 *     2. BatchOptions       — 可选配置
 *     3. PerOpResult        — 单个操作的结果
 *
 * 事务语义：
 *
 *     1. Phase 1 — 逐条校验操作前提条件（validateOperation）。
 *     2. Phase 2 — dry-run execute 全部操作，得到 resultGraph。
 *     3. Phase 3 — 对 resultGraph 运行全局不变量规则。
 *     4. 任一阶段失败 → 整批丢弃，graph 原封不动，返回所有 issue。
 *     5. 全部通过 → 正式返回 resultGraph。
 *
 *     不存在"执行一半需要回滚"的场景——全通过后才开始 execute。
 *
 * 与 reversal 的关系：
 *
 *     applyBatch 不内部调用 createReversal。reversal 的调用时机由上层
 *     （graph_store）在调用 applyBatch 之前决定。
 *     applyBatch 是纯函数，不产生副效应。
 *
 * 外部如何使用：
 *
 *     import { applyBatch } from '@my-project/graph-engine'
 *
 *     const { graph, validation, results } = applyBatch(graph, operations)
 *     if (!validation.valid) {
 *         // 按钮灰掉，展示 validation.issues
 *         return
 *     }
 *     // graph 已更新
 */

import type { GraphData } from '../types/graph_data'
import type { GraphOperation } from '../types/atomic_operations'
import type { ValidationResult } from '../types/validation'
import { validateOperation } from '../core/validate'
import { executeOperation } from '../core/execute'
import type { GlobalRulesTable } from '../core/validators/global_rules'
import { DEFAULT_GLOBAL_RULES_TABLE, runGlobalRules } from '../core/validators/global_rules'

/**
 * 功能：
 *
 *     批处理配置。
 *
 * 规则：
 *
 *     - dryRun：只校验不执行。用于认知操作正式执行前预判。
 *     - stopOnFirst：遇第一个失败即停（默认 false，聚合全部 issue 后返回）。
 *     - globalRulesTable：全局规则开关表。未传入时使用默认全开配置。
 *     - onBeforeEachOperation：逐操作执行前回调，仅暴露中间态，不改变执行结果。
 */
export interface BatchOptions {
    /** 只校验不执行。默认 false。 */
    dryRun?: boolean

    /** 遇第一个失败即停。默认 false——聚合所有 issue。 */
    stopOnFirst?: boolean

    /** 全局规则开关表。默认 DEFAULT_GLOBAL_RULES_TABLE。 */
    globalRulesTable?: GlobalRulesTable

    /**
     * 每原子操作执行前的回调。在逐操作执行循环（Phase 2）中、executeOperation
     * 之前调用，入参为该操作与其执行前的图状态（中间态）。未传时不调用（零行为变化）。
     */
    onBeforeEachOperation?: (op: GraphOperation, graphBeforeOp: GraphData) => void
}

/**
 * 功能：
 *
 *     单个操作的批处理结果。
 */
export interface PerOpResult {
    /** 原始操作。 */
    operation: GraphOperation

    /** 该操作的校验结果。 */
    validation: ValidationResult
}

/**
 * 功能：
 *
 *     applyBatch 的返回值。
 */
export interface BatchResult {
    /** 操作后的图。dryRun 或校验失败时与入参 graph 相同。 */
    graph: GraphData

    /** 聚合后的总体校验结果。valid = true 表示全部通过。 */
    validation: ValidationResult

    /** 每个操作的独立结果。保留此级别以支持前端逐项展示。 */
    results: PerOpResult[]
}

/**
 * 功能：
 *
 *     批量事务执行。修改 GraphData 的唯一入口。
 *
 *     Phase 1 校验操作前提 → Phase 2 dry-run execute → Phase 3 全局规则校验 →
 *     全部通过后返回新图。
 *
 * 规则：
 *
 *     1. validate-all-first：全部校验通过后才开始 execute。
 *     2. 失败回退：任一阶段失败，graph 不变，返回聚合后的 issues。
 *     3. stopOnFirst：遇第一个错误即停。
 *     4. 不内部调用 createReversal——reversal 由上层管理。
 *     5. 全局规则在 Phase 3 对结果图统一运行，不依赖操作类型。
 *
 * 参数：
 *
 *     graph     — 操作前的 GraphData 快照
 *     ops       — 待执行的操作序列
 *     options   — [可选] dryRun / stopOnFirst / globalRulesTable / onBeforeEachOperation
 *
 * 使用：
 *
 *     applyBatch(graph, [moveOp1, moveOp2, moveOp3])           → 批量移动
 *     applyBatch(graph, ops, { dryRun: true })                 → 预判（不执行）
 *     applyBatch(graph, ops, { stopOnFirst: true })            → 遇错即停
 */
export function applyBatch(
    graph: GraphData,
    ops: GraphOperation[],
    options?: BatchOptions,
): BatchResult {
    const dryRun = options?.dryRun ?? false
    const stopOnFirst = options?.stopOnFirst ?? false
    const globalRulesTable = options?.globalRulesTable ?? DEFAULT_GLOBAL_RULES_TABLE

    // Phase 1 — 逐条校验操作前提条件
    const results: PerOpResult[] = []

    for (const op of ops) {
        const validation = validateOperation(graph, op)

        results.push({ operation: op, validation })

        if (!validation.valid && stopOnFirst) break
    }

    const localIssues = results.flatMap(r => r.validation.issues)
    const hasLocalFailure = results.some(r => !r.validation.valid)

    if (hasLocalFailure) {
        return {
            graph,
            validation: { valid: false, issues: localIssues },
            results,
        }
    }

    // Phase 2 — dry-run execute 全部操作，得到 resultGraph
    let resultGraph = graph

    for (const op of ops) {
        // 逐操作挂点：入参为 op 执行前的中间态，不改变执行结果
        options?.onBeforeEachOperation?.(op, resultGraph)
        resultGraph = executeOperation(resultGraph, op)
    }

    // Phase 3 — 对 resultGraph 运行全局不变量规则
    const globalIssues = runGlobalRules(resultGraph, globalRulesTable)
    const hasGlobalFailure = globalIssues.some(issue => issue.severity === 'error')

    if (hasGlobalFailure) {
        return {
            graph,
            validation: { valid: false, issues: [...localIssues, ...globalIssues] },
            results,
        }
    }

    // dryRun 模式：校验通过但不执行
    if (dryRun) {
        return {
            graph,
            validation: { valid: true, issues: [...localIssues, ...globalIssues] },
            results,
        }
    }

    return {
        graph: resultGraph,
        validation: { valid: true, issues: [] },
        results,
    }
}
