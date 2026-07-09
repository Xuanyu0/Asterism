<template>
    <!-- DraftNode 浮空窗 -->
    <div
        v-if="draftNode"
        class="floating-window"
    >
        <h3>Draft Node</h3>

        <input
            v-bind:value="draftNode.label"
            placeholder="Label"
            v-on:input="handleDraftLabelInput"
        />

        <textarea
            v-bind:value="draftNode.summary"
            placeholder="Summary"
            v-on:input="handleDraftSummaryInput"
        />

        <div
            v-if="errorIssues.length > 0"
            class="error-messages"
        >
            <p
                v-for="(issue, index) in errorIssues"
                v-bind:key="issue.code + '-' + index"
                class="error-message"
            >
                {{ issue.message }}
            </p>
        </div>

        <div class="button-row">
            <button v-on:click="controller.confirmDraftNode">
                Confirm
            </button>

            <button v-on:click="controller.cancelDraftNode">
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
            v-bind:value="floatingData.label ?? ''"
            placeholder="Label"
            v-on:input="handleFloatingLabelInput"
        />

        <div
            v-if="errorIssues.length > 0"
            class="error-messages"
        >
            <p
                v-for="(issue, index) in errorIssues"
                v-bind:key="issue.code + '-' + index"
                class="error-message"
            >
                {{ issue.message }}
            </p>
        </div>

        <div class="button-row">
            <button v-on:click="handleFloatingConfirm">
                Confirm
            </button>

            <button v-on:click="controller.closeFloatingWindow">
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
import type { NodeData, EdgeData } from '@my-project/graph-engine'

const draftStore = useDraftStore()
const controller = useOperationController()

const draftNode = computed(() => draftStore.draftNode)

const floatingData = computed(() => controller.ui.state.floatingWindowData)

/**
 * 功能：
 *     从 UI 状态读取当前操作的 error 级校验问题。
 *
 * 规则：
 *     1. 只显示 severity === 'error' 的 issues。
 *     2. warning 级 issues 不在浮空窗显示——warning 允许操作继续。
 */
const errorIssues = computed(() => {
    const validation = controller.ui.state.lastOperationValidation
    if (!validation || !validation.valid) {
        return validation?.issues.filter(issue => issue.severity === 'error') ?? []
    }
    return []
})

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
.error-messages {
    margin-bottom: 8px;
    padding: 8px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
}

.error-message {
    color: #dc2626;
    font-size: 13px;
    margin: 0 0 4px 0;
}

.error-message:last-child {
    margin-bottom: 0;
}

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
