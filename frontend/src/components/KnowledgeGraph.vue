<template>
    <div ref="graphContainer" class="h-screen w-screen bg-slate-50"></div> <!-- Cytoscape 图谱容器 -->
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue' // Vue 生命周期、响应式和 DOM
import cytoscape, { type Core } from 'cytoscape' // Cytoscape 和 Core 类型
import { toCyElements } from '@/definitions/types/graph_types' // GraphData -> Cytoscape elements
import { useGraphStore } from '@/stores/graph_store' // Graph store

const graphContainer = ref<HTMLDivElement | null>(null) // Cytoscape 容器
let cy: Core | null = null // Cytoscape 实例

const graphStore = useGraphStore() // 获取 Graph store

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
        layout: { name: 'grid' },
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
</script>
