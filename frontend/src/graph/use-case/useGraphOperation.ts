/**
 * 工具层图操作用例模块级单例。
 *
 * @remarks
 * 校验状态管理收口：compose 校验结果写入（reportComposeValidation）与清理
 * （clearValidationResult）。为步骤 05 错误反馈链路预留唯一翻译落点（本用例层只
 * 收敛写入，不做错误翻译/结构化）。方法调用时解析 GraphStore 模块级单例
 * （内部 useGraphStore），懒创建，无前置初始化，后续调用返回同一实例。空图守卫由
 * 调用方保留——图缺失属编程错误，直接 throw。
 */

import type {
    ComposeIssue,
    GraphData,
    GraphId,
    GraphLookup,
    GraphOperation,
    OperationBatch,
    ValidationResult,
    ValidationTargetType,
} from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { lookupGraph } from '@/graph/graph_registry'
import { hasErrors } from '@/graph/utils/issue_guard'
import {
    isInGraphOperation,
    isGraphLevelOperation,
} from '@/graph/utils/operation_guards'

/**
 * useGraphOperation 返回的图操作用例单例 API。
 */
export interface GraphOperationAPI {
    /**
     * 对当前图执行批量操作并返回校验结果。
     *
     * @remarks
     * 提交经 store.commitBatchToGraphs——其内部已同步校验结果到 store.lastValidationResult，
     * 本用例层不再重复写入；返回结果原样透传（ValidationResult 不做错误翻译/结构化，
     * 留给步骤 05）。
     *
     * @param operations - 要执行的原子操作序列（图内 / 图级混合，内部拆为判别联合批）
     * @param options - [可选] source：操作来源的工具标识，透传至 commitBatchToGraphs
     * （写入 entry.source，缺省 undefined = 未知来源）。
     * @returns 校验结果（valid + issues 汇总）。
     */
    commitToCurrentGraph(
        operations: GraphOperation[],
        options?: { source?: string },
    ): ValidationResult

    /**
     * 上报 compose 层校验结果。
     *
     * @remarks
     * 判定（hasErrors）与类型转换（ComposeIssue → ValidationIssue）收口在本用例层，
     * 前端业务层不构造任何规则——判定来自引擎 compose，本方法仅转换 + 转发 + 写状态。
     * issues 含 error → 写 lastValidationResult（valid: false + 映射后的 issues），返回
     * true（失败）；issues 无 error → 不写 lastValidationResult，返回 false（可继续提交）。
     *
     * @param issues - compose 函数返回的 ComposeIssue[]
     * @param targetType - 操作对象的类型（node / edge / graph）
     * @param targetId - 操作对象的 ID（可选，graph 级别操作无 targetId）
     * @returns 是否校验失败（true 时调用方应阻断后续提交）。
     */
    reportComposeValidation(
        issues: ComposeIssue[],
        targetType: ValidationTargetType,
        targetId?: string,
    ): boolean

    /**
     * 将当前注册表包装为引擎 compose 层所需的纯查询函数
     * (graphId) → GraphData | undefined，供 induce / internalize / diverge 跨图查询使用。
     */
    makeLookup(): GraphLookup

    /**
     * 清除上一次操作的校验结果（置 lastValidationResult 为 null）。
     *
     * @remarks
     * 与 reportComposeValidation 同为校验状态管理，写入方式一致。
     * 供 UI 层在切换模式/工具/操作、关闭浮空窗、点击错误面板外时调用，
     * 确保用户不会看到已过期的校验错误消息。
     */
    clearValidationResult(): void

    /**
     * 撤销最近一次操作（日志驱动，薄封装透传 store.undo）。
     *
     * @returns 是否存在可撤销的历史且撤销成功。
     */
    undo(): boolean

    /**
     * 重做最近一次撤销（日志驱动，薄封装透传 store.redo）。
     *
     * @returns 是否存在可重做的历史且重做成功。
     */
    redo(): boolean
}

let singleton: GraphOperationAPI | null = null

/**
 * 获取图操作用例模块级单例（懒创建）。
 *
 * @remarks
 * 方法调用时解析 GraphStore 模块级单例（内部 useGraphStore），懒创建，无前置初始化；
 * 后续调用返回同一实例。
 */
export function useGraphOperation(): GraphOperationAPI {
    if (!singleton) {
        singleton = createGraphOperation()
    }
    return singleton
}

function createGraphOperation(): GraphOperationAPI {
    function commitToCurrentGraph(
        operations: GraphOperation[],
        options?: { source?: string },
    ): ValidationResult {
        const graphStore = useGraphStore()
        const graphView = graphStore.graphView
        if (!graphView) {
            // 编程错误通道：调用方均保留空图守卫，此处不可达
            throw new Error(
                'commitToCurrentGraph: 当前无 graphView，无法提交操作',
            )
        }

        // 图级操作与图内操作分拆为独立批（applyBatches 判别联合要求）
        const graphLevelOps = operations.filter(isGraphLevelOperation)
        const inGraphOps = operations.filter(isInGraphOperation)
        const batches: OperationBatch[] = []
        if (graphLevelOps.length > 0) {
            batches.push({ kind: 'graphLevel', operations: graphLevelOps })
        }
        if (inGraphOps.length > 0) {
            batches.push({
                kind: 'inGraph',
                graph: graphView,
                operations: inGraphOps,
            })
        }

        const result = graphStore.commitBatchToGraphs(batches, options)

        return result.validation
    }

    function reportComposeValidation(
        issues: ComposeIssue[],
        targetType: ValidationTargetType,
        targetId?: string,
    ): boolean {
        if (!hasErrors(issues)) {
            return false
        }

        // ComposeIssue 缺 targetType / targetId——在此统一补充；severity / code / message 原样传递
        useGraphStore().lastValidationResult = {
            valid: false,
            issues: issues.map((issue) => ({
                severity: issue.severity,
                code: issue.code,
                message: issue.message,
                targetType,
                ...(targetId !== undefined ? { targetId } : {}),
            })),
        }

        return true
    }

    function makeLookup(): GraphLookup {
        return (graphId: GraphId): GraphData | undefined =>
            lookupGraph(useGraphStore().graphRegistry, graphId)
    }

    function clearValidationResult(): void {
        useGraphStore().lastValidationResult = null
    }

    function undo(): boolean {
        return useGraphStore().undo()
    }

    function redo(): boolean {
        return useGraphStore().redo()
    }

    return {
        commitToCurrentGraph,
        reportComposeValidation,
        makeLookup,
        clearValidationResult,
        undo,
        redo,
    }
}
