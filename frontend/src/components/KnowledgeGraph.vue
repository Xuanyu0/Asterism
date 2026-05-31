<template>
    <div class="knowledge-graph-container">
        <!-- Cytoscape 容器 -->
        <div ref="cyContainer" class="cy-container"></div>

        <!-- Node 浮空窗 -->
        <NodeWindow />

        <!-- Toolbar / 操作按钮 -->
        <OperationToolbar />
    </div>
    
    <div class="relative h-screen w-screen bg-slate-50">
        <div ref="cyContainer" class="h-full w-full"></div>

        <NodeWindow />

        <OperationToolbar />
    </div>


</template>

<script lang="ts" setup>
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

    // 初始化同步 GraphData
    if (graphStore.currentGraph) {
        renderer.syncElements(mapGraphDataToCyElements(graphStore.currentGraph))
    }

    // 绑定 Interaction
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

watch(
    () => graphStore.currentGraph,
    (newGraph) => {
        if (!newGraph) return
        renderer.syncElements(mapGraphDataToCyElements(newGraph))
            console.log('currentGraph:', newGraph)
            console.log('cyElements:', mapGraphDataToCyElements(newGraph))
    },
    { deep: true }    
)

onBeforeUnmount(() => {
    renderer.destroy()
})
</script>


<style scoped>
.knowledge-graph-container {
    width: 100%;
    height: 100%;
    position: relative;
}

.cy-container {
    width: 100%;
    height: 100%;
}
</style>
