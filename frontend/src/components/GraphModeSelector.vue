<template>
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
 *     交互模式切换器，位于画布左上角。
 *
 *     提供知识图谱交互模式（Cognition / Arrangement）的切换和子操作选择。
 *
 * 总体结构：
 *     1. 模式切换按钮（圆形，显示当前模式缩写）
 *     2. 模式选择子列表（Cognition / Arrangement）
 *     3. Cognition 子操作列表（Explore / Unearth / Deconstruct / Induce / Internalize）
 *     4. Arrangement 占位
 *
 * 前端机制（Vue 3 框架行为）：
 *     - computed：Vue 响应式计算属性。依赖的值变化时自动重新计算，且有缓存。
 *     - watch：响应式观察者。interactionMode 变化时自动关闭模式选择列。
 *
 * 外部如何使用：
 *     Graph.vue 挂载本组件。
 */

import { ref, computed, watch } from 'vue'

import { useOperationController } from '@/ui/operation_controller'

const controller = useOperationController()
const uiStore = controller.ui.state

const showModeSelector = ref(false)

// 未来这里需要进行优化
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
</script>

<style scoped>
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
