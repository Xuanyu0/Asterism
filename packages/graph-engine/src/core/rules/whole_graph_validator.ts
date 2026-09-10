/**
 * 对完整 GraphData 做全图体检。
 *
 * @remarks
 * 全图体检是诊断 / 防御工具，非核心路径——加载外部数据时调用本函数做初始验证。
 * 复用 check_invariants.ts 单一执行入口（缺省偏好开关表 = 7 个偏好全开），与
 * applyBatch Phase 3 走同一条校验路径，避免校验逻辑分裂。
 *
 * @param graph - 待体检的 GraphData
 * @returns 校验结果（valid + issues）。
 */

import type { GraphData } from '../../types/graph_data'
import type { ValidationResult } from '../../types/validation'

import { checkInvariants } from './invariants/check_invariants'

export function validateGraph(graph: GraphData): ValidationResult {
    const issues = checkInvariants(graph)

    return {
        valid: issues.every((issue) => issue.severity !== 'error'),
        issues,
    }
}
