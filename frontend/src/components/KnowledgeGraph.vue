<template>
    <div class="relative h-screen w-screen bg-slate-50">
        <!--
            功能：
                Cytoscape 真正挂载的 DOM 容器。

            规则：
                1. ref="cyContainer" 会在 script 中得到这个 DOM。
                2. h-full / w-full 继承父容器尺寸。
                3. 本节点只给 Cytoscape 使用，不放业务逻辑。
        -->
        <div ref="cyContainer" class="h-full w-full"></div>

        <!--
            功能：
                节点浮空窗。

            规则：
                1. DraftNode / 已有节点后续都通过这个组件展示。
                2. 不直接操作 Cytoscape。
        -->
        <NodeWindow />

        <!--
            功能：
                操作工具栏。

            规则：
                1. 负责修改 UI Runtime 的用户意图。
                2. 不直接修改 GraphData。
                3. 不直接操作 Cytoscape。
        -->
        <OperationToolbar />
    </div>
</template>

<script lang="ts" setup>
/**
 * 功能：
 *     KnowledgeGraph 页面组合层。
 *
 * 总体结构：
 *     1. 挂载 Cytoscape 容器
 *     2. 初始化 Cytoscape Renderer
 *     3. 监听 GraphData 变化并同步渲染
 *     4. 绑定 Cytoscape 语义交互事件
 *     5. 挂载 NodeWindow 与 OperationToolbar
 *
 * 外部如何使用：
 *     App.vue 直接挂载本组件。
 */

import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useGraphStore } from '@/graph/graph_store'
import { mapGraphDataToCyElements } from '@/graph/cytoscape/graph_element_mapper'
import { useCytoscapeRenderer } from '@/graph/cytoscape/use_cytoscape_renderer'
import { useGraphInteraction } from '@/graph/cytoscape/use_graph_interaction'
import { useOperationController } from '@/ui/operation_controller'

import NodeWindow from './graph/NodeWindow.vue'
import OperationToolbar from './graph/OperationToolbar.vue'

const cyContainer = ref<HTMLDivElement | null>(null)

const graphStore = useGraphStore()
const renderer = useCytoscapeRenderer(cyContainer)
const operationController = useOperationController()

onMounted(() => {
    renderer.mount()

    if (graphStore.currentGraph) {
        renderer.syncElements(
            mapGraphDataToCyElements(graphStore.currentGraph),
        )
    }

    const cy = renderer.getInstance()

    if (cy) {
        useGraphInteraction(cy, {
            onCanvasClicked(position) {
                operationController.handleCanvasClicked(position)
            },

            onNodeClicked(nodeId) {
                operationController.handleNodeClicked({
                    nodeId,
                })
            },

            onEdgeClicked(edgeId) {
                operationController.handleEdgeClicked({
                    edgeId,
                })
            },

            onNodeDragEnded(nodeId, position) {
                operationController.handleNodeDragEnded({
                    nodeId,
                    position,
                })
            },
        })
    }
})

/**
 * 功能：
 *     监听当前 GraphData 的变化，并同步 Cytoscape 渲染元素。
 *
 * 规则：
 *     1. KnowledgeGraph.vue 只负责组合 Runtime。
 *     2. GraphData 必须先通过 graph_element_mapper.ts 投影为 CyElements。
 *     3. Renderer 只接收 CyElements，不直接接收 GraphData。
 *     4. 本监听不负责修改 GraphData。
 *     5. 本监听不负责决定图谱视角策略。
 */
watch(
    () => graphStore.currentGraph,
    (newGraph) => {
        if (!newGraph) {
            return
        }

        renderer.syncElements(
            mapGraphDataToCyElements(newGraph),
        )
    },
    {
        deep: true,
    },
)

onBeforeUnmount(() => {
    renderer.destroy()
})
</script>
