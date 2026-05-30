<template>
    <div ref="graphContainer" class="h-screen w-screen bg-slate-50"></div> <!-- Cytoscape 图谱容器 -->

    <div
        v-if="draftStore.draftNode"
        class="draft-window"
    >
    <h3>Draft Node</h3>

    <input
        v-model="draftStore.draftNode.label"
        placeholder="Label"
    />


    <textarea
        v-model="draftStore.draftNode.summary"
        placeholder="Summary"
    />

    <button
        @click="confirmDraftNode"
    >
        Confirm
    </button>

    </div>

</template>




<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue' // Vue 生命周期、响应式和 DOM
import cytoscape, { type Core } from 'cytoscape' // Cytoscape 和 Core 类型
import { toCyElements } from '@/definitions/types/graph_types' // GraphData -> Cytoscape elements
import { useGraphStore } from '@/graph/graph_store' // Graph store

import { useUIStore } from '@/ui/ui_store'
import { useDraftStore } from '@/ui/draft_store'


const graphContainer = ref<HTMLDivElement | null>(null) // Cytoscape 容器
let cy: Core | null = null // Cytoscape 实例

const graphStore = useGraphStore() // 获取 Graph store
const uiStore = useUIStore()
const draftStore = useDraftStore()


// 计算当前图的 Cytoscape 元素
const cyElements = computed(() => {
    if (!graphStore.currentGraph) {
        return { nodes: [], edges: [] } // 没有图时返回空
    }
    return toCyElements(graphStore.currentGraph) // GraphData -> Cytoscape 元素
})

// 初始化 Cytoscape
onMounted(() => {
    if (!graphContainer.value) return

    cy = cytoscape({
        container: graphContainer.value,
        elements: cyElements.value,
        layout: { name: 'preset' },
        style: [
            {
                selector: 'node',
                style: {
                    label: 'data(label)',
                    width: 48,
                    height: 48,
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': 12,
                    'background-color': '#e2e8f0',
                    color: '#0f172a',
                },
            },
            {
                selector: 'edge',
                style: {
                    label: 'data(label)',
                    width: 2,
                    'curve-style': 'bezier',
                    'font-size': 10,
                    'line-color': '#64748b',
                    'target-arrow-color': '#64748b',
                },
            },
            { selector: '.node-real', style: { 'background-color': '#bfdbfe' } },
            {
                selector: '.node-virtual',
                style: {
                    'background-color': '#fef3c7',
                    'border-width': 2,
                    'border-style': 'dashed',
                    'border-color': '#f59e0b',
                },
            },
            { selector: '.node-abstract', style: { shape: 'round-rectangle' } },
            { selector: '.edge-directed', style: { 'target-arrow-shape': 'triangle' } },
            { selector: '.edge-virtual', style: { 'line-style': 'dashed' } },
            { selector: '.view-communication', style: { opacity: 0.45 } },

        ],
    })

    // 鼠标悬停效果
    cy.on('mouseover', 'node', (event) => {
        event.target.style('width', 60)
        event.target.style('height', 60)
    })
    cy.on('mouseout', 'node', (event) => {
        event.target.style('width', 48)
        event.target.style('height', 48)
    })

    cy.on('tap', 'node', (event) => {
        console.log(event.target.data()) // 点击节点输出数据
    })

    cy.on('tap', (event) => {
        if (event.target !== cy) {
            return
        }

        if (uiStore.interactionMode !== 'operation') {
            return
        }

        if (uiStore.selectedOperationTool !== 'add') {
            return
        }

        if (uiStore.pendingAddTarget !== 'node') {
            return
        }

        if (!uiStore.pendingAddNode.kind) {
            return
        }

        draftStore.createDraftNode(
            uiStore.pendingAddNode.kind,
            event.position.x,
            event.position.y
        )

        console.log('Draft node created:', draftStore.draftNode)
    })


})

// 监听 currentGraph 更新，刷新 Cytoscape 元素
watch(
    () => graphStore.currentGraph,
    (newGraph) => {
        if (!cy || !newGraph) return
        cy.json({ elements: cyElements.value }) // 更新 Cytoscape 元素
        cy.layout({ name: 'grid' }).run() // 重新布局
    }
)

onBeforeUnmount(() => {
    cy?.destroy()
    cy = null
})


function createNodeId(): string {
    return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function confirmDraftNode(): void {

    console.log('draftNode =', draftStore.draftNode)

    if (!draftStore.draftNode) {
        return
    }

    if (!graphStore.currentGraph) {
        return
    }

    const draftNode = draftStore.draftNode

    if (!draftNode.label.trim()) {
        return
    }

    const result = graphStore.applyOperation({
        type: 'add_node',
        node: {
            id: createNodeId(),
            graphId: graphStore.currentGraph.id,
            kind: draftNode.kind,
            form: draftNode.kind === 'real' ? 'normal' : undefined,
            viewRole: 'normal',
            label: draftNode.label.trim(),
            summary: draftNode.summary.trim(),
            abstractionLevel: 0,
            degree: 0,
            position: {
                x: draftNode.x,
                y: draftNode.y,
            },
        },
    })

    if (result.valid) {
        draftStore.clearDraftNode()
    }

    console.log('Confirm draft node result:', result)
}


</script>

<style scoped>
.draft-window {
    position: absolute;
    top: 20px;
    right: 20px;

    width: 300px;

    padding: 12px;

    background: white;

    border: 1px solid #ccc;

    z-index: 999;
}

.draft-window input,
.draft-window textarea {
    width: 100%;
    margin-bottom: 8px;
}
</style>
