<template>
    <!-- 常驻操作栏（顶部中央） -->
    <div class="standing-toolbar">
        <button
            v-for="btn in standingButtons"
            v-bind:key="btn.tool"
            v-bind:class="{ active: activeToolId === btn.tool }"
            v-bind:title="btn.label"
            v-on:click="activateTool(btn)"
        >
            {{ btn.icon }}
        </button>

        <!-- 删除待定提示 -->
        <template v-if="activeToolId === 'delete' && (uiStore.pendingDeleteNodeId || uiStore.pendingDeleteEdgeId)">
            <span class="delete-confirm-hint">再次点击目标确认删除，或：</span>
            <button class="confirm-delete-btn" v-on:click="controller.confirmDelete()">
                确认
            </button>
            <button class="cancel-delete-btn" v-on:click="controller.cancelDelete()">
                取消
            </button>
        </template>
    </div>

    <!-- 模式按钮 + 子操作（左上角） -->
    <div class="mode-toolbar">
        <div class="toolbar-column main-column">
            <button
                class="mode-btn"
                v-on:click="toggleModeSelector"
            >
                {{ modeButtonLabel }}
            </button>

            <!-- 模式选择子列表 -->
            <Transition name="slide-left">
                <div
                    v-if="showModeSelector"
                    class="mode-selector-list"
                >
                    <button
                        v-bind:class="{ active: uiStore.interactionMode === 'cognition' }"
                        v-on:click="setMode('cognition')"
                    >
                        Cognition
                    </button>
                    <button
                        v-bind:class="{ active: uiStore.interactionMode === 'arrangement' }"
                        v-on:click="setMode('arrangement')"
                    >
                        Arrangement
                    </button>
                </div>
            </Transition>

            <!-- Cognition 子操作 -->
            <Transition name="slide-left">
                <div
                    v-if="!showModeSelector && uiStore.interactionMode === 'cognition'"
                    class="cognition-action-list"
                >
                    <button v-on:click="controller.explore()">
                        Explore
                    </button>
                    <button v-on:click="controller.unearth()">
                        Unearth
                    </button>
                    <button
                        v-bind:class="{ active: uiStore.selectedCognitionAction === 'deconstruct' }"
                        v-on:click="controller.selectCognitionAction(
                            uiStore.selectedCognitionAction === 'deconstruct' ? null : 'deconstruct'
                        )"
                    >
                        Deconstruct
                    </button>
                    <button v-on:click="controller.induce([])">
                        Induce
                    </button>
                    <button v-on:click="controller.internalize([])">
                        Internalize
                    </button>
                </div>
            </Transition>

            <!-- Arrangement 占位 -->
            <div v-if="!showModeSelector && uiStore.interactionMode === 'arrangement'">
                <span class="placeholder-text">Arrangement — Phase 2</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能：
 *
 *     提供知识图谱操作界面——顶部常驻操作栏 + 左上角模式工具栏。
 *
 * 总体结构：
 *
 *     1. 常驻操作栏（顶部中央）——8 个按钮，直接激活对应工具
 *     2. 模式工具栏（左上角）——模式切换按钮 + 子操作列表
 *
 * 前端机制（Vue 3 框架行为）：
 *     - computed：Vue 响应式计算属性。依赖的值变化时自动重新计算，且有缓存。
 *       C++ 类比：缓存的 getter，依赖追踪自动失效。
 *
 *     - watch：响应式观察者。interactionMode 变化时自动关闭模式选择列。
 *       C++ 类比：Observer + 自动依赖追踪 + 自动注册/注销。
 *
 * 外部如何使用：
 *
 *     KnowledgeGraph.vue 挂载本组件。
 */

import { ref, computed, watch } from 'vue'
import { useOperationController } from '@/ui/operation_controller'

const controller = useOperationController()
const uiStore = controller.ui.state

const showModeSelector = ref(false)

/**
 * 功能：
 *
 *     由 pending 状态反推当前激活的常驻按钮 ID，用于高亮。
 */
const activeToolId = computed(() => {
    if (uiStore.selectedOperationTool === 'delete') return 'delete'
    if (uiStore.selectedOperationTool === 'fold') return 'fold'
    if (uiStore.selectedOperationTool === 'add') {
        if (uiStore.pendingAddTarget === 'node') {
            if (uiStore.pendingAddNode.kind === 'real') return 'add-real-node'
            if (uiStore.pendingAddNode.kind === 'virtual') return 'add-virtual-node'
        }
        if (uiStore.pendingAddTarget === 'edge') {
            const k = uiStore.pendingAddEdge.kind
            const d = uiStore.pendingAddEdge.direction
            if (k === 'real' && d === 'directed') return 'add-real-directed'
            if (k === 'real' && d === 'undirected') return 'add-real-undirected'
            if (k === 'virtual' && d === 'directed') return 'add-virtual-directed'
            if (k === 'virtual' && d === 'undirected') return 'add-virtual-undirected'
        }
    }
    return null
})

const modeButtonLabel = computed(() => {
    switch (uiStore.interactionMode) {
        case 'cognition': return 'C'
        case 'arrangement': return 'A'
        default: return 'C'
    }
})

watch(() => uiStore.interactionMode, () => {
    showModeSelector.value = false
})

function toggleModeSelector(): void {
    showModeSelector.value = !showModeSelector.value
}

function setMode(mode: 'cognition' | 'arrangement'): void {
    if (mode === 'cognition') controller.enterCognitionMode()
    else controller.enterArrangementMode()
    showModeSelector.value = false
}

// 常驻操作栏按钮定义
const standingButtons = [
    // 节点组
    { tool: 'add-real-node' as const, icon: '+ 实○', label: '添加实节点' },
    { tool: 'add-virtual-node' as const, icon: '+ 虚○', label: '添加虚节点' },
    // 边组
    { tool: 'add-real-directed' as const, icon: '+ 实→', label: '添加有向实边' },
    { tool: 'add-real-undirected' as const, icon: '+ 实—', label: '添加无向实边' },
    { tool: 'add-virtual-directed' as const, icon: '+ 虚→', label: '添加有向虚边' },
    { tool: 'add-virtual-undirected' as const, icon: '+ 虚—', label: '添加无向虚边' },
    // 工具组
    { tool: 'delete' as const, icon: ' x ', label: '删除' },
    { tool: 'fold' as const, icon: '∨', label: '折叠' },
]

function activateTool(btn: (typeof standingButtons)[number]): void {
    // Toggle：若当前按钮对应的工具状态已激活，重置为无选中状态。
    if (activeToolId.value === btn.tool) {
        controller.resetOperationTool()
        return
    }

    switch (btn.tool) {
        case 'add-real-node':
            controller.selectOperationTool('add')
            controller.selectAddTarget('node')
            controller.selectAddNodeKind('real')
            break
        case 'add-virtual-node':
            controller.selectOperationTool('add')
            controller.selectAddTarget('node')
            controller.selectAddNodeKind('virtual')
            break
        case 'add-real-directed':
            controller.selectOperationTool('add')
            controller.selectAddTarget('edge')
            controller.selectAddEdgeKind('real')
            controller.selectAddEdgeDirection('directed')
            break
        case 'add-real-undirected':
            controller.selectOperationTool('add')
            controller.selectAddTarget('edge')
            controller.selectAddEdgeKind('real')
            controller.selectAddEdgeDirection('undirected')
            break
        case 'add-virtual-directed':
            controller.selectOperationTool('add')
            controller.selectAddTarget('edge')
            controller.selectAddEdgeKind('virtual')
            controller.selectAddEdgeDirection('directed')
            break
        case 'add-virtual-undirected':
            controller.selectOperationTool('add')
            controller.selectAddTarget('edge')
            controller.selectAddEdgeKind('virtual')
            controller.selectAddEdgeDirection('undirected')
            break
        case 'delete':
            controller.selectOperationTool('delete')
            break
        case 'fold':
            controller.selectOperationTool('fold')
            break
    }
}
</script>

<style scoped>
/* ── 常驻操作栏（顶部中央）── */

.standing-toolbar {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(6px);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 999;
}

.standing-toolbar button {
    padding: 3px 8px;
    border: 1px solid #cbd5e1;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
}

.standing-toolbar button:hover {
    background: #f1f5f9;
    transform: translateY(-1px);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.standing-toolbar button.active {
    background: #bfdbfe;
    border-color: #3b82f6;
}

/* 组间间距（第3个=边组起点，第7个=工具组起点） */
.standing-toolbar > button:nth-child(3),
.standing-toolbar > button:nth-child(7) {
    margin-left: 8px;
}

.delete-confirm-hint {
    font-size: 12px;
    color: #ef4444;
    padding: 0 4px;
    white-space: nowrap;
}

.standing-toolbar .confirm-delete-btn {
    background: #ef4444;
    color: white;
    border-color: #dc2626;
}

.standing-toolbar .confirm-delete-btn:hover {
    background: #dc2626;
}

.standing-toolbar .cancel-delete-btn {
    color: #6b7280;
}

/* ── 模式工具栏（左上角）── */

.mode-toolbar {
    position: absolute;
    top: 20px;
    left: 8px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 0;
    z-index: 999;
}

.toolbar-column {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 8px;
    margin-left: 2px;
    border-left: 2px solid #e2e8f0;
}

.toolbar-column:first-child {
    border-left: none;
    padding-left: 0;
    margin-left: 0;
}

.toolbar-column button {
    padding: 4px 10px;
    border: 1px solid #cbd5e1;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
    text-align: left;
    transition: background 0.15s;
}

.toolbar-column button:hover {
    background: #f1f5f9;
}

.toolbar-column button.active {
    background: #bfdbfe;
    border-color: #3b82f6;
}

.toolbar-column button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.mode-btn {
    font-weight: bold;
    font-size: 14px !important;
    width: 32px;
    height: 32px;
    padding: 0 !important;
    border-radius: 50% !important;
    text-align: center !important;
    line-height: 30px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.mode-btn:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.mode-selector-list,
.cognition-action-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: max-content;
    z-index: 1;
}

.slide-left-enter-active,
.slide-left-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
    opacity: 0;
    transform: translateX(-12px);
}

.placeholder-text {
    font-size: 12px;
    color: #94a3b8;
    padding: 4px 8px;
    white-space: nowrap;
}
</style>
