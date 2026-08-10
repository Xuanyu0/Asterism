/**
 * 功能：
 *
 *     对完整 GraphData 做全图体检。复用 global_rules.ts 中的全局规则列表。
 *
 * 总体结构：
 *
 *     1. validateGraph — 全图体检统一入口
 *     2. 全局规则统一执行
 *
 * 规则：
 *
 *     1. 全图体检是诊断/防御工具，非核心路径。
 *     2. 加载外部数据时调用本函数做初始验证。
 *     3. 本函数与 applyBatch Phase 3 复用同一套全局规则，避免校验路径分裂。
 *
 * 外部如何使用：
 *
 *     import { validateGraph } from '@my-project/graph-engine'
 */

import type { GraphData } from '../../types/graph_data'
import type { ValidationResult } from '../../types/validation'
import { runGlobalRules } from './global_rules'

export function validateGraph(graph: GraphData): ValidationResult {
    const issues = runGlobalRules(graph)

    return {
        valid: issues.every((issue) => issue.severity !== 'error'),
        issues,
    }
}
