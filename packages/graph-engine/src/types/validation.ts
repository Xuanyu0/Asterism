/**
 * validation.ts
 *
 * 功能：
 *     定义图规则校验结果的通用类型。
 *
 * 总体结构：
 *     1. ValidationSeverity：校验严重等级
 *     2. ValidationTargetType：校验对象类型
 *     3. ValidationIssue：单个校验问题
 *     4. ValidationResult：完整校验结果
 *
 * 外部使用方式：
 *     import type { ValidationResult } from '@my-project/graph-engine'
 */

export type ValidationSeverity = 'info' | 'warning' | 'error'

export type ValidationTargetType = 'graph' | 'node' | 'edge'

export interface ValidationIssue {
    severity: ValidationSeverity
    code: string
    message: string
    targetType: ValidationTargetType
    targetId?: string
}

export interface ValidationResult {
    valid: boolean
    issues: ValidationIssue[]
}
