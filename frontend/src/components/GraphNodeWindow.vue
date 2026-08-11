<template>
    <!-- 物理挂 body，逻辑仍组件树；popper 注入 left/top 实现锚定到目标 -->
    <Teleport to="body">
        <!-- 浮空窗（新建草稿 / 节点边编辑共用）：数据源与差异全部折叠进 formModel -->
        <div
            v-if="formModel"
            v-bind:ref="registerWindowRoot"
            class="fixed z-999 w-75 rounded-xl border-2 border-slate-200 bg-stone-50/80 p-3 backdrop-blur-sm"
        >
            <div class="mb-2 flex items-center justify-between">
                <h3 class="text-base text-slate-600">
                    {{ formModel.title }}
                </h3>
                <button
                    type="button"
                    class="flex cursor-pointer items-center justify-center rounded-full border-2 border-slate-300 p-0.5 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
                    v-bind:aria-label="'关闭窗口'"
                    v-on:click="formModel.onClose"
                >
                    <XMarkIcon class="pointer-events-none size-4 stroke-2" />
                </button>
            </div>

            <div class="mb-2 flex items-center gap-2">
                <label class="text-sm font-medium text-slate-600">标签</label>
                <input
                    class="flex-1 border-b-2 border-slate-200 bg-transparent text-center text-sm text-slate-600 outline-none"
                    v-bind:value="formModel.label"
                    placeholder="请输入标签..."
                    v-on:input="formModel.onLabelInput"
                />
            </div>

            <template v-if="formModel.showSummary">
                <label class="mb-1 block text-sm font-medium text-slate-600"
                    >摘要</label
                >
                <textarea
                    maxlength="80"
                    class="summary-input mb-2.5 h-[88px] w-full resize-none px-2.5 py-2 text-sm text-slate-600 outline-none placeholder:text-slate-400"
                    v-bind:value="formModel.summary"
                    placeholder="请输入摘要..."
                    v-on:input="formModel.onSummaryInput"
                />
            </template>

            <div class="mt-1 flex gap-2">
                <button class="btn-primary" v-on:click="formModel.onConfirm">
                    Confirm
                </button>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * 功能：
 *
 *     节点/边浮空窗——新建草稿（DraftNode）与已有节点/边编辑共用同一模板。
 *
 * 总体结构：
 *
 *     1. 数据源：draftNode（新建草稿，add_node handler 持有）与 floatingData
 *        （编辑数据，floatingWindow 单例持有）互斥出现，同时为空则不渲染。
 *     2. formModel：computed 派生视图模型，把两分支的差异（标题 / 是否显示
 *        Summary / Cancel / ✕ / 处理函数）折叠成模板唯一消费对象。
 *     3. 锚定：watch(anchorTargetId + windowRootEl) → attachPopper，与渲染解耦。
 *
 * 规则：
 *
 *     1. 经 <Teleport to="body"> 物理挂载到 body；锚定位置由 renderer.attachPopper
 *        注入 left/top（草稿窗锚定预览节点，编辑窗锚定目标节点/边中点）。
 *     2. 根元素注册沿用 useFloatingWindow.registerContainer（外部点击关闭判定），
 *        与锚定共用同一根元素。
 *     3. 关闭统一走右上角 ✕：草稿模式=onCancel（清草稿 + 清理预览），
 *        编辑模式=floatingWindow.close()。外部点击仅对编辑模式生效
 *        （useFloatingWindow 的监听规则只认 floatingData）。
 */

import { computed, watch, ref, onBeforeUnmount } from 'vue'

import { XMarkIcon } from '@heroicons/vue/24/outline'

import { useToolMediator } from '@/feature-tools/mediator'
import { useFloatingWindow } from '@/composables/useFloatingWindow'
import { useRenderer } from '@/cytoscape/useRenderer'

import type { ComponentPublicInstance } from 'vue'
import type {
    NodeData,
    EdgeData,
    KnowledgeNodeData,
} from '@my-project/graph-engine'

const mediator = useToolMediator()
const floatingWindow = useFloatingWindow()
const renderer = useRenderer()

const draftNode = computed(
    () => mediator.activeHandler.value?.draftNode ?? null,
)

// 数据源切换：经 default handler 门面转发单例状态（getter 在 computed 内访问以建立响应式依赖）
const defaultHandler = mediator.registry.get('default')
const floatingData = computed(() => defaultHandler?.floatingWindowData ?? null)

// ── 编辑草稿（本地状态，Confirm 时才提交）──

const editingData = ref<NodeData | EdgeData | null>(null)

watch(floatingData, () => {
    editingData.value = null
})

const isEdge = computed(() => {
    const data = floatingData.value
    if (!data) return false
    return 'source' in data && 'target' in data
})

const isKnowledgeNode = computed(() => {
    const data = floatingData.value
    return (
        !!data && !isEdge.value && 'role' in data && data.role === 'knowledge'
    )
})

// ── 统一视图模型 ──

/**
 * 浮空窗表单的完整描述：模板只消费本对象，两分支差异全部折叠进字段。
 */
interface FloatingFormModel {
    title: string
    label: string
    summary: string
    showSummary: boolean
    onLabelInput: (event: Event) => void
    onSummaryInput: (event: Event) => void
    onConfirm: () => void
    onClose: () => void
}

const formModel = computed<FloatingFormModel | null>(() => {
    const draft = draftNode.value
    if (draft) {
        return {
            title: '新建节点',
            label: draft.label,
            summary: draft.summary,
            showSummary: true,
            onLabelInput: handleDraftLabelInput,
            onSummaryInput: handleDraftSummaryInput,
            onConfirm: handleConfirmDraftNode,
            onClose: handleCancelDraftNode,
        }
    }

    const data = floatingData.value
    if (data) {
        return {
            title: '编辑',
            label: editingData.value?.label ?? data.label ?? '',
            summary: isKnowledgeNode.value
                ? (((editingData.value ?? data) as KnowledgeNodeData).summary ??
                  '')
                : '',
            showSummary: isKnowledgeNode.value,
            onLabelInput: handleFloatingLabelInput,
            onSummaryInput: handleFloatingSummaryInput,
            onConfirm: handleFloatingConfirm,
            onClose: closeFloatingWindow,
        }
    }

    return null
})

// ==================== 草稿模式（新建节点） ====================

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

// ==================== 编辑模式（已有节点/边） ====================

function handleFloatingLabelInput(event: Event): void {
    const target = event.target as HTMLInputElement
    const data = floatingData.value

    if (!data) return

    if (!editingData.value) {
        editingData.value = { ...data }
    }

    editingData.value = { ...editingData.value, label: target.value }
}

function handleFloatingSummaryInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement

    if (!isKnowledgeNode.value) return

    if (!editingData.value) {
        editingData.value = { ...floatingData.value! }
    }

    editingData.value = {
        ...(editingData.value as KnowledgeNodeData),
        summary: target.value,
    }
}

function handleFloatingConfirm(): void {
    if (!editingData.value) return

    const label = editingData.value.label ?? ''
    const summary = isKnowledgeNode.value
        ? ((editingData.value as KnowledgeNodeData).summary ?? '')
        : ''

    mediator.activeHandler.value?.onConfirm?.(label, summary)

    editingData.value = null
}

function closeFloatingWindow(): void {
    floatingWindow.close()
}

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
 * 草稿窗与编辑窗互斥显示，共用一个锚定根；v-if 切换时经 ref 回调更新。
 */
const windowRootEl = ref<HTMLElement | null>(null)

/**
 * 锚定目标 id：草稿窗取预览节点 nodeId，编辑窗取实体 id（node.id / edge.id）。
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
 * 组件挂载/卸载（含 v-if 切换）时经 ref 回调调用。草稿窗与编辑窗互斥，
 * 同一回调对二者均安全——floatingData 为 null 时外部点击监听提前返回，
 * 草稿窗注册为容器无副作用。
 *
 * @param el - ref 回调参数（本窗口根元素是原生 div，卸载时为 null）
 */
function registerWindowRoot(
    el: Element | ComponentPublicInstance | null,
): void {
    // Vue 的 ref 回调参数类型较宽；本窗口根元素是原生 div，卸载时为 null
    const htmlEl = el instanceof HTMLElement ? el : null
    windowRootEl.value = htmlEl
    floatingWindow.registerContainer(htmlEl)
}
</script>

<style scoped>
/* 摘要输入横线纸：无边框，浅灰横线表达输入位置。
   高度/禁用拉伸/字数上限由模板 tailwind 类控制（h-[88px] + resize-none + maxlength）。
   起点用 background-position 显式钉在 padding 之后（8px = 模板 py-2），
   不依赖 background-origin: content-box——textarea 上该值在 Chrome 行为不可靠。 */
.summary-input {
    /* 横线间距 = 行高（24px），文字逐行坐在横线上方 */
    line-height: 24px;
    /* 图案从 padding-box 顶平铺，整体下移 padding-top(8px)，使首条线对齐首行文字底部 */
    background-position: 0 8px;
    /* 内容滚动时横线跟随，避免只显示固定几行线 */
    background-attachment: local;
    background-image: repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent 23px,
        #cbd5e1 23px,
        #cbd5e1 24px
    );
}
</style>
