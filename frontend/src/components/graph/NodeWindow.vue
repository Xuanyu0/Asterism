<template>
    <!-- DraftNode 浮空窗 -->
    <div
        v-if="draftNode"
        class="floating-window"
    >
        <h3>Draft Node</h3>

        <input
            :value="draftNode.label"
            placeholder="Label"
            @input="handleDraftLabelInput"
        />

        <textarea
            :value="draftNode.summary"
            placeholder="Summary"
            @input="handleDraftSummaryInput"
        />

        <div class="button-row">
            <button @click="controller.confirmDraftNode">
                Confirm
            </button>

            <button @click="controller.cancelDraftNode">
                Cancel
            </button>
        </div>
    </div>

    <!-- 已有节点/边编辑浮空窗 -->
    <div
        v-else-if="floatingData"
        class="floating-window"
    >
        <h3>{{ isEdge ? 'Edit Edge' : 'Edit Node' }}</h3>

        <input
            :value="floatingData.label ?? ''"
            placeholder="Label"
            @input="handleFloatingLabelInput"
        />

        <div class="button-row">
            <button @click="handleFloatingConfirm">
                Confirm
            </button>

            <button @click="controller.closeFloatingWindow">
                Cancel
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能：
 *     提供节点/边浮空窗组件——DraftNode 与已有节点/边共用。
 *
 * 总体结构：
 *     1. DraftNode 编辑入口（新建节点草稿）
 *     2. 已有节点/边编辑入口（浮空窗修改）
 *     3. 两种模式互斥显示
 *
 * 前端机制（Vue 3 框架行为）：
 *     - computed：
 *       Vue 响应式计算属性。依赖的值变化时自动重新计算，且有缓存。
 *       C++ 类比：缓存的 getter，依赖追踪自动失效。
 *
 *     - v-if / v-else-if：
 *       条件渲染。DraftNode 和 floatingWindowData 互斥，同时只有一个显示。
 *       C++ 类比：if-else 分支，但框架在依赖变化时自动重新评估。
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 挂载本组件。
 */

import { computed } from 'vue'
import { useDraftStore } from '@/ui/draft_store'
import { useOperationController } from '@/ui/operation_controller'
import type { NodeData, EdgeData } from '@/definitions/types/graph_types'

const draftStore = useDraftStore()
const controller = useOperationController()

const draftNode = computed(() => draftStore.draftNode)

const floatingData = computed(() => controller.ui.state.floatingWindowData)

const isEdge = computed(() => {
    const data = floatingData.value
    if (!data) return false
    return 'source' in data && 'target' in data
})

/**
 * 功能：
 *     判断 floatingWindowData 是否为 EdgeData。
 *
 * 规则：
 *     1. EdgeData 有 source/target 字段，NodeData 没有。
 */
function isEdgeData(data: NodeData | EdgeData): data is EdgeData {
    return 'source' in data && 'target' in data
}

// ==================== DraftNode 编辑 ====================

function handleDraftLabelInput(event: Event): void {
    const target = event.target as HTMLInputElement

    controller.updateDraftNode({
        label: target.value,
    })
}

function handleDraftSummaryInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement

    controller.updateDraftNode({
        summary: target.value,
    })
}

// ==================== 已有节点/边编辑 ====================

let editingData: NodeData | EdgeData | null = null

function handleFloatingLabelInput(event: Event): void {
    const target = event.target as HTMLInputElement
    const data = floatingData.value

    if (!data) return

    if (!editingData) {
        editingData = { ...data }
    }

    editingData = { ...editingData, label: target.value }
}

function handleFloatingConfirm(): void {
    if (!editingData) return

    if (isEdgeData(editingData)) {
        controller.confirmExistingEdgeEdit(editingData)
    } else {
        controller.confirmExistingNodeEdit(editingData)
    }

    editingData = null
}
</script>

<style scoped>
.floating-window {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 300px;
    padding: 12px;
    background: white;
    border: 1px solid #ccc;
    z-index: 999;
}

.floating-window input,
.floating-window textarea {
    width: 100%;
    margin-bottom: 8px;
}

.button-row {
    display: flex;
    gap: 8px;
}
</style>
