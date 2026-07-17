/**
 * 功能：
 *
 *     ComposeIssue → ValidationIssue 类型边界适配工具。
 *
 * 总体结构：
 *
 *     1. mapComposeIssues — compose 层 issue 到校验层 issue 的映射
 *     2. hasErrors        — 判断 issue 列表是否含 error 级问题
 *
 * 外部如何使用：
 *
 *     import { mapComposeIssues, hasErrors } from '@/graph/issue_mapper'
 */

import type { ComposeIssue, ValidationIssue, ValidationTargetType } from '@my-project/graph-engine'


/**
 * 功能：
 *
 *     将引擎 compose 层的 ComposeIssue[] 转换为校验层 ValidationIssue[]。
 *
 * 规则：
 *
 *     1. ComposeIssue 缺 targetType / targetId——由调用方补充。
 *     2. 映射在前端边界统一完成，引擎类型保持纯净。
 *     3. severity / code / message 原样传递。
 *
 * 参数：
 *
 *     issues — compose 函数返回的 ComposeIssue[]
 *     targetType — 操作对象的类型（node / edge / graph）
 *     targetId — 操作对象的 ID（可选，graph 级别操作无 targetId）
 */
export function mapComposeIssues(
    issues: ComposeIssue[],
    targetType: ValidationTargetType,
    targetId?: string,
): ValidationIssue[] {
    return issues.map(issue => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        targetType,
        ...(targetId !== undefined ? { targetId } : {}),
    }))
}

/**
 * 功能：
 *
 *     检查 ComposeIssue[] 是否含 error 级问题。
 *
 * 规则：
 *
 *     含 error 时操作不可提交，前端应展示错误并阻断。
 */
export function hasErrors(issues: ComposeIssue[]): boolean {
    return issues.some(issue => issue.severity === 'error')
}
