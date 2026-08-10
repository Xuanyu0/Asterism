<template>
    <!-- 模式按钮 + 子操作（左上角） -->
    <div class="mode-toolbar">
        <div class="toolbar-column main-column">
            <button class="mode-btn" v-on:click="toggleModeSelector">
                {{ modeButtonLabel }}
            </button>

            <!-- 模式选择子列表 -->
            <Transition name="slide-left">
                <div v-if="showModeSelector" class="mode-selector-list">
                    <button
                        v-bind:class="{ active: activeMode === 'cognition' }"
                        v-on:click="setMode('cognition')"
                    >
                        Cognition
                    </button>
                    <button
                        v-bind:class="{ active: activeMode === 'arrangement' }"
                        v-on:click="setMode('arrangement')"
                    >
                        Arrangement
                    </button>
                </div>
            </Transition>

            <!-- Cognition 子操作 -->
            <Transition name="slide-left">
                <div
                    v-if="!showModeSelector && activeMode === 'cognition'"
                    class="cognition-action-list"
                >
                    <button v-on:click="controller.explore()">Explore</button>
                    <button v-on:click="controller.unearth()">Unearth</button>
                    <button
                        v-bind:class="{
                            active:
                                mediator.activeToolId.value === 'deconstruct',
                        }"
                        v-on:click="mediator.activate('deconstruct')"
                    >
                        Deconstruct
                    </button>
                    <button v-on:click="controller.induce([])">Induce</button>
                    <button v-on:click="controller.internalize([])">
                        Internalize
                    </button>
                </div>
            </Transition>

            <!-- Arrangement 占位 -->
            <div v-if="!showModeSelector && activeMode === 'arrangement'">
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
 */

import { ref, computed } from 'vue'

import { useOperationController } from '@/ui/operation_controller'
import { useToolMediator } from '@/feature-tools/mediator'

const controller = useOperationController()
const mediator = useToolMediator()

const showModeSelector = ref(false)

// 当前展开的模式列。本地状态管理，替代已移除的 uiStore.interactionMode。
const activeMode = ref<'cognition' | 'arrangement' | null>('cognition')

const modeButtonLabel = computed(() => {
    return activeMode.value === 'arrangement' ? 'A' : 'C'
})

function toggleModeSelector(): void {
    showModeSelector.value = !showModeSelector.value
}

function setMode(mode: 'cognition' | 'arrangement'): void {
    mediator.deactivate()
    activeMode.value = mode
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
    transition:
        opacity 0.3s ease,
        transform 0.3s ease;
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
