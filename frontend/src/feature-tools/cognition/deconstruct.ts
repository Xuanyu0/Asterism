/**
 * 解构（Deconstruct）工具处理器，实现 ToolHandler 接口。
 *
 * @remarks
 * 用户激活后点击画布节点执行解构操作。单次操作完成后自动退出（自取消），
 * 不依赖 operation_controller，仅支持单节点、单图操作，无草稿、无预览。
 */

import { ref, computed } from 'vue'

import { deconstruct as composeDeconstruct } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperation } from '@/graph/use-case/useGraphOperation'
import { useToolMediator } from '@/feature-tools/mediator'

import type { ToolHandler } from '@/feature-tools/types'

export function useDeconstructTool(): ToolHandler {
    const graphStore = useGraphStore()
    const operations = useGraphOperation()
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
     * 处理节点点击——执行解构操作（compose → 校验 → commitBatchToGraphs → 自取消）。
     *
     * @remarks
     * 委托引擎 composeDeconstruct 产出 batches（判别联合），经 store.commitBatchToGraphs
     * 直接提交（applyBatches 统一执行图内 / 图级批），完成后自动调用 mediator.deactivate()
     * 取消自身。
     */
    function onNodeClick(nodeId: string): void {
        if (!graphStore.graphView || !nodeId) {
            return
        }

        const result = composeDeconstruct({
            nodeId,
            parentGraph: graphStore.graphView,
        })

        // compose 校验收口在用例层：失败则写 lastValidationResult 并阻断本次操作
        if (operations.reportComposeValidation(result.issues, 'node', nodeId)) {
            return
        }

        // 批次判别联合 → commitBatchToGraphs 直接提交（父图 update_node + 子图 add_node 填充 + 图级 add_graph）
        graphStore.commitBatchToGraphs(result.batches, {
            source: 'deconstruct',
        })

        // 单次操作完成后自动退出
        mediator.deactivate()
    }

    return {
        id: 'deconstruct',
        get isActive() {
            return isActive.value
        },
        activate,
        deactivate,
        onNodeClick,
        get cursorClass() {
            return cursorClass.value
        },
        get notification() {
            return null
        },
    }
}
