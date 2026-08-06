/**
 * 功能：
 *
 *     解构（Deconstruct）工具处理器。实现 ToolHandler 接口。
 *     用户激活后点击画布节点执行解构操作。
 *
 * 总体结构：
 *
 *     1. useDeconstructTool() → ToolHandler（激活即用，单次操作后自取消）
 *
 * 规则：
 *
 *     1. 单次操作完成后自动退出（自取消）。
 *     2. 不依赖 operation_controller。
 *     3. 仅支持单节点、单图操作，无草稿、无预览。
 */

import { ref, computed } from 'vue'

import { deconstruct as composeDeconstruct } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'
import { useToolMediator } from '@/feature-tools/mediator'

import type { ToolHandler } from '@/feature-tools/types'


export function useDeconstructTool(): ToolHandler {
    const graphStore = useGraphStore()
    const operations = useGraphOperationAdapter()
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
     *     处理节点点击——执行解构操作（compose → 校验 → commitToCurrentGraph → 自取消）。
     *
     * 规则：
     *
     *     1. 委托引擎 composeDeconstruct 产出 operations。
     *     2. 经适配层 commitToCurrentGraph 统一提交到 graphView。
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

        // compose 校验收口在适配层：失败则写 lastValidationResult 并阻断本次操作
        if (operations.reportComposeValidation(result.issues, 'node', nodeId)) {
            return
        }

        operations.commitToCurrentGraph(result.operations)

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
