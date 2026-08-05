<template>
    <!-- DraftNode 浮空窗 -->
    <div
        v-if="draftNode"
        class="floating-window"
    >
        <h3>Draft Node</h3>

        <label class="field-label">Label</label>
        <input
            v-bind:value="draftNode.label"
            placeholder="Label"
            v-on:input="handleDraftLabelInput"
        />

        <label class="field-label">Summary</label>
        <textarea
            v-bind:value="draftNode.summary"
            placeholder="Summary"
            v-on:input="handleDraftSummaryInput"
        />

        <div class="button-row">
            <button v-on:click="handleConfirmDraftNode">
                Confirm
            </button>

            <button class="btn-secondary" v-on:click="handleCancelDraftNode">
                Cancel
            </button>
        </div>
    </div>

    <!-- 已有节点/边编辑浮空窗 -->
    <div
        v-else-if="floatingData"
        v-bind:ref="registerFloatingContainer"
        class="floating-window"
    >
        <div class="floating-window-header">
            <h3>{{ isEdge ? 'Edit Edge' : 'Edit Node' }}</h3>

            <button
                type="button"
                class="floating-window-close"
                v-bind:aria-label="'关闭编辑窗口'"
                v-on:click="closeFloatingWindow"
            >
                <XMarkIcon class="size-4 pointer-events-none" />
            </button>
        </div>

        <label class="field-label">Label</label>
        <input
            v-bind:value="floatingData.label ?? ''"
            placeholder="Label"
            v-on:input="handleFloatingLabelInput"
        />

        <template v-if="isKnowledgeNode">
            <label class="field-label">Summary</label>
            <textarea
                v-bind:value="floatingSummary"
                placeholder="Summary"
                v-on:input="handleFloatingSummaryInput"
            />
        </template>

        <div class="button-row">
            <button v-on:click="handleFloatingConfirm">
                Confirm
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
 */

import { computed, watch, type ComponentPublicInstance } from 'vue'

import { XMarkIcon } from '@heroicons/vue/24/outline'

import { useToolMediator } from '@/feature-tools/mediator'
import { useFloatingWindow } from '@/feature-tools/composables/useFloatingWindow'

import type { NodeData, EdgeData, KnowledgeNodeData } from '@my-project/graph-engine'

const mediator = useToolMediator()
const floatingWindow = useFloatingWindow()

const draftNode = computed(() => mediator.activeHandler.value?.draftNode ?? null)

// 数据源切换：经 default handler 门面转发单例状态（getter 在 computed 内访问以建立响应式依赖）
const defaultHandler = mediator.registry.get('default')
const floatingData = computed(() => defaultHandler?.floatingWindowData ?? null)

watch(floatingData, () => {
    editingData = null
})

const isEdge = computed(() => {
    const data = floatingData.value
    if (!data) return false
    return 'source' in data && 'target' in data
})

const isKnowledgeNode = computed(() => {
    const data = floatingData.value
    return !!data && !isEdge.value && 'role' in data && data.role === 'knowledge'
})

const floatingSummary = computed(() => {
    if (!isKnowledgeNode.value) return ''
    return (floatingData.value as KnowledgeNodeData).summary ?? ''
})

// ==================== DraftNode 编辑 ====================

function handleDraftLabelInput(event: Event): void {
    const target = event.target as HTMLInputElement

    mediator.activeHandler.value?.updateDraftNode?.({
        label: target.value,
    })
}

function handleDraftSummaryInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement

    mediator.activeHandler.value?.updateDraftNode?.({
        summary: target.value,
    })
}

function handleConfirmDraftNode(): void {
    const active = mediator.activeHandler.value
    if (!active?.draftNode) return

    active.onConfirm?.(
        active.draftNode.label,
        active.draftNode.summary,
    )
}

function handleCancelDraftNode(): void {
    mediator.activeHandler.value?.onCancel?.()
}

// ==================== 已有节点/边编辑 ====================

let editingData: NodeData | EdgeData | null = null

// 浮空窗根元素注册：组件挂载/卸载时（含 v-if 切换）经 ref 回调上报给单例
function registerFloatingContainer(el: Element | ComponentPublicInstance | null): void {
    // Vue 的 ref 回调参数类型较宽；本窗口根元素是原生 div，卸载时为 null
    floatingWindow.registerContainer(el instanceof HTMLElement ? el : null)
}

function closeFloatingWindow(): void {
    floatingWindow.close()
}

function handleFloatingLabelInput(event: Event): void {
    const target = event.target as HTMLInputElement
    const data = floatingData.value

    if (!data) return

    if (!editingData) {
        editingData = { ...data }
    }

    editingData = { ...editingData, label: target.value }
}

function handleFloatingSummaryInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement

    if (!isKnowledgeNode.value) return

    if (!editingData) {
        editingData = { ...floatingData.value! }
    }

    editingData = { ...(editingData as KnowledgeNodeData), summary: target.value }
}

function handleFloatingConfirm(): void {
    if (!editingData) return

    const label = editingData.label ?? ''
    const summary = isKnowledgeNode.value
        ? (editingData as KnowledgeNodeData).summary ?? ''
        : ''

    mediator.activeHandler.value?.onConfirm?.(label, summary)

    editingData = null
}
</script>

<style scoped>
.floating-window {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 300px;
    padding: 16px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06);
    z-index: 999;
}

.floating-window h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #1e293b;
}

.floating-window-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.floating-window-header h3 {
    margin: 0;
}

.floating-window-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: #64748b;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.floating-window-close:hover {
    background: #f1f5f9;
    color: #1e293b;
}

.field-label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: 500;
    color: #475569;
}

.floating-window input,
.floating-window textarea {
    width: 100%;
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.floating-window input:focus,
.floating-window textarea:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.button-row {
    display: flex;
    gap: 8px;
    margin-top: 4px;
}

.button-row button {
    flex: 1;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
}

.button-row button:first-child {
    background: #3b82f6;
    color: white;
    border: none;
}

.button-row button:first-child:hover {
    background: #2563eb;
    transform: translateY(-1px);
}
</style>
