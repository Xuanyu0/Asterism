/**
 * 说明：
 *
 *     工具层图操作适配模块级单例。
 *     并把 compose 校验结果写入收口为显式方法（reportComposeValidation）。
 *     为步骤 05 错误反馈链路预留唯一翻译落点（本适配层只收敛写入，不做错误翻译/结构化）。
 *
 * 调用契约：
 *
 *     1. 方法调用时解析当前激活的 Pinia（内部 useGraphStore），必须在 Pinia 安装后调用。
 *     2. 后续调用返回同一实例。
 *     3. 空图守卫由调用方保留；本适配层不再提供假 validation 兜底——图缺失属编程错误，直接 throw。
 */

import type {
    ComposeIssue,
    GraphData,
    GraphId,
    GraphLookup,
    GraphOperation,
    ValidationResult,
    ValidationTargetType,
} from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { lookupGraph } from '@/graph/graph_registry'
import { hasErrors } from '@/graph/utils/issue_guard'

/**
 * 说明：
 *
 *     useGraphOperationAdapter 返回的图操作适配单例 API。
 */
export interface GraphOperationAdapterAPI {
    /**
     * 说明：
     *
     *     对当前图执行批量操作并返回校验结果。提交经 store.commitBatchToGraphs——
     *     其内部已同步校验结果到 store.lastValidationResult，本适配层不再重复写入；
     *     返回结果原样透传（ValidationResult 不做错误翻译/结构化，留给步骤 05）。
     *
     * 参数：
     *
     *     operations — 要执行的原子操作序列。
     */
    commitToCurrentGraph(operations: GraphOperation[]): ValidationResult

    /**
     * 说明：
     *
     *     上报 compose 层校验结果：判定（hasErrors）与类型转换（ComposeIssue → ValidationIssue）收口在本适配层，
     *     前端业务层不构造任何规则——判定来自引擎 compose，本方法仅转换 + 转发 + 写状态。
     *
     * 行为：
     *
     *     1. issues 含 error → 写 lastValidationResult（valid: false + 映射后的 issues），返回 true（失败）。
     *     2. issues 无 error → 不写 lastValidationResult，返回 false（可继续提交）。
     *
     * 参数：
     *
     *     issues — compose 函数返回的 ComposeIssue[]
     *     targetType — 操作对象的类型（node / edge / graph）
     *     targetId — 操作对象的 ID（可选，graph 级别操作无 targetId）
     *
     * 返回：
     *
     *     是否校验失败（true 时调用方应阻断后续提交）。
     */
    reportComposeValidation(
        issues: ComposeIssue[],
        targetType: ValidationTargetType,
        targetId?: string,
    ): boolean

    /**
     * 说明：
     *
     *     将当前注册表包装为引擎 compose 层所需的纯查询函数
     *     (graphId) → GraphData | undefined，供 induce / internalize / diverge 跨图查询使用。
     */
    makeLookup(): GraphLookup
}

let singleton: GraphOperationAdapterAPI | null = null

/**
 * 说明：
 *
 *     获取图操作适配模块级单例（懒创建）。
 *
 * 调用契约：
 *
 *     1. 方法调用时解析当前激活的 Pinia（内部 useGraphStore），必须在 Pinia 安装后调用。
 *     2. 后续调用返回同一实例。
 */
export function useGraphOperationAdapter(): GraphOperationAdapterAPI {
    if (!singleton) {
        singleton = createGraphOperationAdapter()
    }
    return singleton
}

function createGraphOperationAdapter(): GraphOperationAdapterAPI {
    function commitToCurrentGraph(operations: GraphOperation[]): ValidationResult {
        const graphStore = useGraphStore()
        const graphView = graphStore.graphView
        if (!graphView) {
            // 编程错误通道：调用方均保留空图守卫，此处不可达
            throw new Error('commitToCurrentGraph: 当前无 graphView，无法提交操作')
        }

        const result = graphStore.commitBatchToGraphs([{ graph: graphView, operations }])

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
            issues: issues.map(issue => ({
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
        return (graphId: GraphId): GraphData | undefined => lookupGraph(useGraphStore().graphRegistry, graphId)
    }

    return {
        commitToCurrentGraph,
        reportComposeValidation,
        makeLookup,
    }
}
