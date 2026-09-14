/**
 * 校验结果构造辅助。
 *
 * @remarks
 * valid 判定单源：任一 error 级 issue 即 false。in_graph / graph_level /
 * whole_graph_validator 三处共用，避免谓词漂移。
 */

import type { ValidationIssue, ValidationResult } from '../../types/validation'

/**
 * 从 issues 列表构造 ValidationResult。
 *
 * @param issues - 待包装的校验问题列表
 * @returns 校验结果（valid + 原样 issues）
 */
export function toValidationResult(issues: ValidationIssue[]): ValidationResult {
    return {
        valid: issues.every((issue) => issue.severity !== 'error'),
        issues,
    }
}
