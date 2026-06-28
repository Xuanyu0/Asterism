/**
 * apply.ts
 *
 * 功能：
 *     操作执行的统一入口。先校验，通过后执行。
 *
 * 规则：
 *     1. validate 失败时返回原始 graph 不变。
 *     2. validate 通过后才调 execute。
 *     3. 纯函数，不持有状态。
 *
 * 外部如何使用：
 *     import { applyOperation } from '@my-project/graph-engine'
 */

import type { GraphData } from '../types/graph_data'
import type { GraphOperation } from '../types/atomic_operations'
import type { ValidationResult } from '../types/validation'
import { validateOperation } from './validate'
import { executeOperation } from './execute'

export function applyOperation(
    graph: GraphData,
    operation: GraphOperation,
): { graph: GraphData; validation: ValidationResult } {
    const validation = validateOperation(graph, operation)

    if (!validation.valid) {
        return { graph, validation }
    }

    const newGraph = executeOperation(graph, operation)

    return { graph: newGraph, validation }
}
