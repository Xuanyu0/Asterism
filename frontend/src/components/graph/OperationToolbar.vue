<template>
    <div class="operation-toolbar">
        <button
            :class="{ active: uiStore.interactionMode === 'cognition' }"
            @click="enterCognitionMode"
        >
            Cognition
        </button>

        <button
            :class="{ active: uiStore.interactionMode === 'operation' }"
            @click="enterOperationMode"
        >
            Operation
        </button>

        <button
            :class="{ active: uiStore.selectedOperationTool === 'add' }"
            @click="selectAddTool"
        >
            Add
        </button>

        <button
            :class="{ active: uiStore.pendingAddTarget === 'node' }"
            @click="selectAddNode"
        >
            Add Node
        </button>

        <button
            :class="{ active: uiStore.pendingAddNode.kind === 'real' }"
            @click="selectRealNode"
        >
            Real
        </button>

        <button
            :class="{ active: uiStore.pendingAddNode.kind === 'virtual' }"
            @click="selectVirtualNode"
        >
            Virtual
        </button>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能：
 *     提供知识图谱操作工具栏组件。
 *
 * 总体结构：
 *     1. 模式切换
 *     2. Add Tool 入口
 *     3. Add Node 类型选择
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 挂载本组件。
 */

import { useUIStore } from '@/ui/ui_store'

const uiStore = useUIStore()

function enterCognitionMode(): void {
    uiStore.setInteractionMode('cognition')
}

function enterOperationMode(): void {
    uiStore.setInteractionMode('operation')
}

function selectAddTool(): void {
    uiStore.setInteractionMode('operation')
    uiStore.selectOperationTool('add')
}

function selectAddNode(): void {
    uiStore.setInteractionMode('operation')
    uiStore.selectOperationTool('add')
    uiStore.setAddTarget('node')
}

function selectRealNode(): void {
    uiStore.setInteractionMode('operation')
    uiStore.selectOperationTool('add')
    uiStore.setAddTarget('node')
    uiStore.selectNodeKind('real')
}

function selectVirtualNode(): void {
    uiStore.setInteractionMode('operation')
    uiStore.selectOperationTool('add')
    uiStore.setAddTarget('node')
    uiStore.selectNodeKind('virtual')
}
</script>

<style scoped>
.operation-toolbar {
    position: absolute;
    top: 20px;
    left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 999;
}

.operation-toolbar button {
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    background: white;
    border-radius: 6px;
    cursor: pointer;
}

.operation-toolbar button.active {
    background: #bfdbfe;
    border-color: #3b82f6;
}
</style>
