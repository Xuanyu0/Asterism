/**
 * registry.ts
 *
 * 功能：
 *     规则启用/禁用配置表。Phase 3 扩展点——按场景启用/禁用不同规则子集。
 *
 * 规则：
 *     当前全部启用。AI 批量操作场景下可能需要暂时关闭部分校验。
 *
 * 外部如何使用：
 *     import { DEFAULT_RULES } from '@my-project/graph-engine'
 */

export const DEFAULT_RULES: Record<string, boolean> = {
    validateNodeLabel: true,
    validateNodeSummary: true,
    validateEdgeLabel: true,
    validateSelfLoop: true,
    validateDuplicateEdge: true,
    validateVirtualNodeEdgeRule: true,
    validateRealDirectedCycle: true,
    validateHeuristicEdgeReference: true,
    validateReferenceNodeOperationConstraint: true,
    validateDanglingReference: true,
}
