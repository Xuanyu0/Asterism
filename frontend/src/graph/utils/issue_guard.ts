/**
 * 功能：
 *
 *     ComposeIssue 判定工具：hasErrors — 判断 compose 层 issue 列表是否含 error 级问题。
 *
 * 总体结构：
 *
 *     1. hasErrors — 判断 issue 列表是否含 error 级问题
 *
 * 规则：
 *
 *     ComposeIssue → ValidationIssue 的映射（mapComposeIssues）已内联进适配层
 *     （useGraphOperationAdapter.reportComposeValidation）——前端业务层零构造零直写，
 *     映射仅在适配层统一完成。
 */

import type { ComposeIssue } from '@my-project/graph-engine'

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
    return issues.some((issue) => issue.severity === 'error')
}
