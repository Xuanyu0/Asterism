/**
 * 图不变量校验的单一执行入口。
 *
 * @remarks
 * 执行语义（分类模型定稿）分两段：
 * 1. 硬性不变量（structural.ts 的 STRUCTURAL_RULES）：无条件执行、不查询任何开关表——
 *    违反后数据 / 引擎无法被正确解释或操作，缺席配置面；
 * 2. 图不变量偏好（preferences.ts 的 PREFERENCE_RULES）：按偏好开关表执行，
 *    `table[code] ?? true` 缺省开启，可经 PreferenceRulesTable 选择性关闭。
 * 类别文件只声明规则（check 函数 + 规则列表），执行循环仅此一份。
 *
 * @param graph - 待校验的 GraphData
 * @param preferenceRulesTable - 偏好规则开关表（只作用于偏好规则，硬性规则不受其影响）
 * @returns 硬性 + 已开启偏好规则聚合出的全部 issues
 */

import type { GraphData } from '../../../types/graph_data'
import type { ValidationIssue } from '../../../types/validation'

import { STRUCTURAL_RULES } from './structural'
import { PREFERENCE_RULES } from './preferences'
import { DEFAULT_PREFERENCE_TABLE, type PreferenceRulesTable } from './preference_rules_table'

/**
 * 执行全部不变量校验：硬性恒跑 + 偏好按表。
 *
 * @param graph - 待校验的 GraphData
 * @param preferenceRulesTable - 偏好规则开关表，缺省 DEFAULT_PREFERENCE_TABLE（未显式设置的偏好规则默认开启）
 * @returns 聚合后的全部 issues
 */
export function checkInvariants(
    graph: GraphData,
    preferenceRulesTable: PreferenceRulesTable = DEFAULT_PREFERENCE_TABLE,
): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // 硬性不变量：无条件执行，不查表（缺席配置面）
    for (const rule of STRUCTURAL_RULES) {
        issues.push(...rule.check(graph))
    }

    // 偏好不变量：按偏好开关表执行，缺省开启
    for (const rule of PREFERENCE_RULES) {
        const enabled = preferenceRulesTable[rule.code] ?? true
        if (!enabled) continue

        issues.push(...rule.check(graph))
    }

    return issues
}
