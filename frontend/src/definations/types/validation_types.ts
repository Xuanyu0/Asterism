/**
 * validation_types.ts
 *
 * 功能：
 * 定义图规则校验结果的通用类型。
 *
 * 总体结构：
 * 1. ValidationLevel：校验等级
 * 2. ValidationTargetType：校验对象类型
 * 3. ValidationIssue：单个校验问题
 * 4. ValidationResult：完整校验结果
 *
 * 外部使用方式：
 * import type { ValidationIssue, ValidationResult } from '@/types/validation_types'
 */

export type ValidationLevel = 'info' | 'warning' | 'error'    // 校验等级

export type ValidationTargetType = 'graph' | 'node' | 'edge'    // 校验对象类型

export interface ValidationIssue {
    level: ValidationLevel    // 问题等级
    code: string    // 机器可读错误码
    message: string    // 用户可读提示
    targetType: ValidationTargetType    // 问题对象类型
    targetId?: string    // 问题对象 id
}

export interface ValidationResult {
    valid: boolean    // 是否通过校验
    issues: ValidationIssue[]    // 校验问题列表
}
