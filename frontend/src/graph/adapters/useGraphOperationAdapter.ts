/**
 * 说明：
 *
 *     工具层图操作适配模块级单例。
 *     并把预校验失败写入收口为显式方法。
 *     为步骤 05 错误反馈链路预留唯一翻译落点（本适配层只收敛写入，不做错误翻译/结构化）。
 *
 * 调用契约：
 *
 *     1. 方法调用时解析当前激活的 Pinia（内部 useGraphStore），必须在 Pinia 安装后调用。
 *     2. 后续调用返回同一实例。
 *     3. 空图守卫由调用方保留；本适配层仅保留防御分支——空图时返回失败结果且不写校验状态。
 */

import type { GraphData, GraphId, GraphLookup, GraphOperation, ValidationResult } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { lookupGraph } from '@/graph/graph_registry'

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
     *     将当前注册表包装为引擎 compose 层所需的纯查询函数
     *     (graphId) → GraphData | undefined，供 induce / internalize / diverge 跨图查询使用。
     */
    makeLookup(): GraphLookup

    /**
     * 说明：
     *
     *     在提交前写入校验失败结果（预校验收口）。供调用方前置校验失败分支使用，
     *     替代对 store.lastValidationResult 的直接赋值。
     *
     * 参数：
     *
     *     validation — 失败校验结果。
     */
    setValidationFailure(validation: ValidationResult): void
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
            // 防御分支：调用方均保留空图守卫，正常情况下不可达；仅返回失败结果，不写校验状态
            return { valid: false, issues: [] }
        }

        const result = graphStore.commitBatchToGraphs([{ graph: graphView, operations }])

        return result.validation
    }

    function makeLookup(): GraphLookup {
        return (graphId: GraphId): GraphData | undefined => lookupGraph(useGraphStore().graphRegistry, graphId)
    }

    function setValidationFailure(validation: ValidationResult): void {
        useGraphStore().lastValidationResult = validation
    }

    return {
        commitToCurrentGraph,
        makeLookup,
        setValidationFailure,
    }
}
