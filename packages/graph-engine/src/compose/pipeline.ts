/**
 * pipeline.ts
 *
 * 功能：
 *
 *     操作序列事务流水线。所有 composite 编排共享的批量执行入口。
 *
 * 总体结构：
 *
 *     1. applyBatch         — 事务流水线（全通过→执行，任一失败→丢弃）
 *     2. BatchOptions       — 可选配置
 *     3. PerOpResult        — 单个操作的结果
 *
 * 事务语义：
 *
 *     预校验方案（validate-all-first）：
 *         1. 逐条 validate
 *         2. 任一失败 → 整批丢弃，graph 原封不动，返回所有 issue
 *         3. 全通过 → 逐条 execute，返回新 graph
 *
 *     不存在"执行一半需要回滚"的场景——全通过后才开始 execute。
 *
 * 与 reversal 的关系：
 *
 *     applyBatch 不内部调用 createReversal。reversal 的调用时机由上层
 *     （graph_store）在调用 applyBatch 之前决定——这是 Step 11 的职责。
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
import type { GraphRegistry } from '../types/infrastructure_types'
import type { GraphOperation } from '../types/atomic_operations'
import type { ValidationResult } from '../types/validation'
import { validateOperation } from '../core/validate'
import { executeOperation } from '../core/execute'

/**
 * 功能：
 *
 *     批处理配置。
 *
 * 规则：
 *
 *     - dryRun：只 validate 不 execute。用于认知操作正式执行前预判。
 *     - stopOnFirst：遇第一个失败即停（默认 false，聚合全部 issue 后返回）。
 */
export interface BatchOptions {
    /** 只校验不执行。默认 false。 */
    dryRun?: boolean

    /** 遇第一个失败即停。默认 false——聚合所有 issue。 */
    stopOnFirst?: boolean
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
 *     批量事务执行。逐条 validate → 全通过后逐条 execute。
 *     任一失败则整批丢弃，入参 graph 原封不动。
 *
 * 规则：
 *
 *     1. validate-all-first：全部校验通过后才开始 execute。
 *     2. 失败回退：任一校验不通过，graph 不变，返回聚合后的 issues。
 *     3. stopOnFirst：遇第一个错误即停（可配合 dryRun 预判）。
 *     4. 不内部调用 createReversal——reversal 由上层管理。
 *
 * 参数：
 *
 *     graph     — 操作前的 GraphData 快照
 *     ops       — 待执行的操作序列
 *     options   — [可选] dryRun / stopOnFirst
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
    optionsOrRegistry?: BatchOptions | GraphRegistry,
    options?: BatchOptions,
): BatchResult {
    // registry 可通过第三个参数传入（applyBatch(graph, ops, registry)），
    // 也可通过第四个参数传入（applyBatch(graph, ops, registry, options)），
    // 或省略（纯单图场景）
    let registry: GraphRegistry | undefined
    let batchOptions: BatchOptions | undefined

    if (optionsOrRegistry instanceof Map) {
        registry = optionsOrRegistry
        batchOptions = options
    } else {
        batchOptions = optionsOrRegistry
    }

    const dryRun = batchOptions?.dryRun ?? false
    const stopOnFirst = batchOptions?.stopOnFirst ?? false

    // Phase 1 — 逐条 validate
    const results: PerOpResult[] = []

    for (const op of ops) {
        const validation = validateOperation(graph, op)

        results.push({ operation: op, validation })

        if (!validation.valid && stopOnFirst) break
    }

    // 聚合校验结果
    const allIssues = results.flatMap(r => r.validation.issues)
    const hasFailure = results.some(r => !r.validation.valid)

    if (hasFailure) {
        return {
            graph,
            validation: { valid: false, issues: allIssues },
            results,
        }
    }

    // Phase 2 — dryRun 时跳过 execute
    if (dryRun) {
        return {
            graph,
            validation: { valid: true, issues: allIssues },
            results,
        }
    }

    // Phase 3 — 全通过，逐条 execute
    let currentGraph = graph

    for (const op of ops) {
        currentGraph = executeOperation(currentGraph, op, registry)
    }

    return {
        graph: currentGraph,
        validation: { valid: true, issues: [] },
        results,
    }
}
