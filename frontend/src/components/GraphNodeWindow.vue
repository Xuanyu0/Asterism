<template>
    <!-- 物理挂 body，逻辑仍组件树；popper 注入 left/top 实现锚定到目标 -->
    <Teleport to="body">
        <!-- DraftNode 浮空窗 -->
        <div v-if="draftNode" v-bind:ref="registerWindowRoot" class="floating-window">
            <h3>Draft Node</h3>

            <label class="field-label">Labzel</label>
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
                <button v-on:click="handleConfirmDraftNode">Confirm</button>

                <button class="btn-secondary" v-on:click="handleCancelDraftNode">Cancel</button>
            </div>
        </div>

        <!-- 已有节点/边编辑浮空窗 -->
        <div v-else-if="floatingData" v-bind:ref="registerWindowRoot" class="floating-window">
            <div class="floating-window-header">
                <h3>{{ isEdge ? 'Edit Edge' : 'Edit Node' }}</h3>

                <button
                    type="button"
                    class="floating-window-close"
                    v-bind:aria-label="'关闭编辑窗口'"
                    v-on:click="closeFloatingWindow"
                >
                    <XMarkIcon class="pointer-events-none size-4" />
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
                <button v-on:click="handleFloatingConfirm">Confirm</button>
            </div>
        </div>
    </Teleport>
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
 * 规则：
 *     1. 经 <Teleport to="body"> 物理挂载到 body；锚定位置由 renderer.attachPopper
 *        注入 left/top（draft 窗锚定预览节点，编辑窗锚定目标节点/边中点）。
 *     2. 根元素注册沿用 useFloatingWindow.registerContainer（外部点击关闭判定），
 *        与锚定共用同一根元素。
 */

import { computed, watch, ref, onBeforeUnmount } from 'vue'

import { XMarkIcon } from '@heroicons/vue/24/outline'

import { useToolMediator } from '@/feature-tools/mediator'
import { useFloatingWindow } from '@/composables/useFloatingWindow'
import { useRenderer } from '@/cytoscape/useRenderer'

import type { ComponentPublicInstance } from 'vue'
import type { NodeData, EdgeData, KnowledgeNodeData } from '@my-project/graph-engine'

const mediator = useToolMediator()
const floatingWindow = useFloatingWindow()
const renderer = useRenderer()

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

    active.onConfirm?.(active.draftNode.label, active.draftNode.summary)
}

function handleCancelDraftNode(): void {
    mediator.activeHandler.value?.onCancel?.()
}

// ==================== 已有节点/边编辑 ====================

let editingData: NodeData | EdgeData | null = null

// ── 浮空窗 锚定（popper） ──

/**
 * 当前锚定句柄（单实例）。
 *
 * @remarks
 * 重建（目标切换）与组件卸载前必须先 destroy——否则 Cytoscape 事件监听泄漏。
 */
let popperHandle: { update(): void; destroy(): void } | null = null

/**
 * 当前浮空窗根元素。
 *
 * @remarks
 * draft 窗与编辑窗互斥显示，共用一个锚定根；v-if 切换时经 ref 回调更新。
 */
const windowRootEl = ref<HTMLElement | null>(null)

/**
 * 锚定目标 id：draft 窗取预览节点 nodeId，编辑窗取实体 id（node.id / edge.id）。
 */
const anchorTargetId = computed<string | null>(() => {
    if (draftNode.value) {
        return draftNode.value.nodeId ?? null
    }
    if (floatingData.value) {
        return floatingData.value.id
    }
    return null
})

// 目标 id 或根元素变化 → 重建锚定。flush: 'post' 保证根元素 ref 已就位（v-if 窗口渲染完成后）。
// 同时依赖 windowRootEl：组件重挂载时浮空窗状态（模块级单例）存活而根元素 ref 重建，
// 若只 watch 目标 id，immediate 触发时根元素未就位会漏建锚定。
watch(
    [anchorTargetId, windowRootEl],
    ([targetId]) => {
        if (popperHandle) {
            popperHandle.destroy()
            popperHandle = null
        }

        if (!targetId || !windowRootEl.value) return

        popperHandle = renderer.attachPopper(targetId, windowRootEl.value)
    },
    { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
    popperHandle?.destroy()
    popperHandle = null
})

/**
 * 浮空窗根元素注册回调：兼作锚定根捕获与外部点击容器注册。
 *
 * @remarks
 * 组件挂载/卸载（含 v-if 切换）时经 ref 回调调用。draft 窗与编辑窗互斥，
 * 同一回调对二者均安全——floatingData 为 null 时外部点击监听提前返回，
 * draft 窗注册为容器无副作用。
 *
 * @param el - ref 回调参数（本窗口根元素是原生 div，卸载时为 null）
 */
function registerWindowRoot(el: Element | ComponentPublicInstance | null): void {
    // Vue 的 ref 回调参数类型较宽；本窗口根元素是原生 div，卸载时为 null
    const htmlEl = el instanceof HTMLElement ? el : null
    windowRootEl.value = htmlEl
    floatingWindow.registerContainer(htmlEl)
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
    const summary = isKnowledgeNode.value ? ((editingData as KnowledgeNodeData).summary ?? '') : ''

    mediator.activeHandler.value?.onConfirm?.(label, summary)

    editingData = null
}
</script>

<style scoped>
.floating-window {
    /* 定位由 cy_popper 锚定注入 left/top；position: fixed 与 strategy: 'fixed' 配套
       （视口坐标系）——absolute 会按文档坐标系解析视口坐标，导致偏移且撑大文档触发滚动条 */
    position: fixed;
    width: 300px;
    padding: 16px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.1),
        0 1px 4px rgba(0, 0, 0, 0.06);
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
    transition:
        background 0.15s,
        color 0.15s;
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
    transition:
        border-color 0.15s,
        box-shadow 0.15s;
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
    transition:
        background 0.15s,
        transform 0.1s;
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
