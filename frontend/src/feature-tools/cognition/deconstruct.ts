/**
 * 功能：
 *     解构（Deconstruct）工具处理器。实现 ToolHandler 接口。
 *     用户激活后点击画布节点执行解构操作。
 *
 * 规则：
 *     1. 单次操作完成后自动退出（自取消）。
 *     2. 不依赖 operation_controller。
 *     3. 仅支持单节点、单图操作，无草稿、无预览。
 *
 * 外部如何使用：
 *     Graph.vue 注册到 mediator：mediator.register('deconstruct', useDeconstructTool())
 */

import { ref, computed } from 'vue'

import { deconstruct as composeDeconstruct } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useToolMediator } from '@/feature-tools/mediator'
import { mapComposeIssues, hasErrors } from '@/graph/issue_mapper'

import type { ToolHandler } from '@/feature-tools/types'


export function useDeconstructTool(): ToolHandler {
    const graphStore = useGraphStore()
    const mediator = useToolMediator()

    const isActive = ref(false)

    const cursorClass = computed<string | null>(() => {
        return isActive.value ? 'cursor-deconstruct' : null
    })

    function activate(): void {
        isActive.value = true
    }

    function deactivate(): void {
        isActive.value = false
    }

    /**
     * 功能：
     *
     *     处理节点点击——执行解构操作（compose → validate → applyBatch → 自取消）。
     *
     * 规则：
     *
     *     1. 委托引擎 composeDeconstruct 产出 operations。
     *     2. commitBatchToGraph 统一提交到 graphView。
     *     3. 操作完成后自动调用 mediator.deactivate() 取消自身。
     */
    function onNodeClick(nodeId: string): void {
        if (!graphStore.graphView || !nodeId) {
            return
        }

        const result = composeDeconstruct({
            nodeId,
            parentGraph: graphStore.graphView,
        })

        if (hasErrors(result.issues)) {
            graphStore.lastValidationResult = {
                valid: false,
                issues: mapComposeIssues(result.issues, 'node', nodeId),
            }

            return
        }

        const batchResult = graphStore.commitBatchToGraph(
            graphStore.graphView,
            result.operations,
        )

        graphStore.lastValidationResult = batchResult.validation

        // 单次操作完成后自动退出
        mediator.deactivate()
    }

    return {
        id: 'deconstruct',
        get isActive() { return isActive.value },
        activate,
        deactivate,
        onNodeClick,
        get cursorClass() { return cursorClass.value },
        get notification() { return null },
    }
}
