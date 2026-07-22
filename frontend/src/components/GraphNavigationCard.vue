<script lang="ts" setup>
/**
 * 功能：
 *
 *     导航卡片编排器。
 *     组合通用 composable 与领域子组件，
 *     持有面板状态、图谱切换逻辑与全局事件绑定。
 *
 * 总体结构：
 *
 *     1. composable（useDragPosition / useAutoFade）
 *     2. 面板编排状态（activePanel / hasOpenPanel / panelOpensUpward / panelTransitionName）
 *     3. 图谱视图模型（pathSegments / parentGraphId / currentRootId / isAtRoot）
 *     4. 图谱切换与面板切换逻辑
 *     5. 全局事件（onDocumentPointerdown / onDocumentKeydown）
 *     6. 生命周期
 *
 * 规则：
 *
 *     1. 本组件只读 graphStore 状态，所有图谱切换经 graphStore.loadGraphToView。
 *     2. 切换图谱前清理 UI 现场：关闭浮空窗、取消激活工具。
 *     3. Dock 溢出检测由 NavigationCardDock 内部自管理。
 *
 * 外部如何使用：
 *
 *     Graph.vue 挂载本组件。
 */

import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

import type { GraphId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'
import { useToolMediator } from '@/feature-tools/mediator'
import { useDragPosition } from '@/composables/useDragPosition'
import { useAutoFade } from '@/composables/useAutoFade'

import type { PanelKind, PathSegment } from '@/components/navigation-card/types'
import Dock from '@/components/navigation-card/Dock.vue'
import NavigationPanel from '@/components/navigation-card/NavigationPanel.vue'
import SearchPanel from '@/components/navigation-card/SearchPanel.vue'

const graphStore = useGraphStore()
const uiStore = useUIStore()
const mediator = useToolMediator()

// ── 拖拽 ──
const drag = useDragPosition({
    storageKey: 'nav-card-position',
    defaultPosition: { x: 64, y: 16 },
    margin: 16,
    snapthreshold:  32
})
const {
    position: cardPosition,
    isDragging,
    elementRef: cardElement,
    handlers: dragHandlers,
    clampToViewport,
} = drag

// ── 面板状态管理 ──
const activePanel = ref<PanelKind>('none')
const hasOpenPanel = computed(() => activePanel.value !== 'none')

function closePanels(): void {
    activePanel.value = 'none'
}

function toggleNavigationPanel(): void {
    if (activePanel.value === 'navigation') {
        closePanels()
        return
    }
    activePanel.value = 'navigation'
}

function toggleSearchPanel(): void {
    if (activePanel.value === 'search') {
        closePanels()
        return
    }
    activePanel.value = 'search'
}

// ── 面板自适应（展开后不越过视口） ──
const viewportHeight = ref(window.innerHeight)
const viewportWidth = ref(window.innerWidth)
const panelOpensUpward = computed(() => cardPosition.value.y > viewportHeight.value * 0.5)
const panelAlignRight = computed(() => cardPosition.value.x + 290 > viewportWidth.value)
const panelTransitionName = computed(() => (panelOpensUpward.value ? 'panel-rise' : 'panel-drop'))

// ── 自动淡化 ──
const { isFaded, onPointerEnter, onPointerLeave } = useAutoFade({
    preventFade: computed(() => hasOpenPanel.value || isDragging.value),
})

// ── 路径与位置 ──
const pathSegments = computed<PathSegment[]>(() => {
    return graphStore.graphPath.map((graphId, index) => ({
        graphId,
        title: graphStore.getGraphById(graphId)?.title ?? '未命名',
        isCurrent: index === graphStore.graphPath.length - 1,
    }))
})

const parentGraphId = computed(() => graphStore.graphView?.parentGraphId ?? null)
const currentRootId = computed(() => graphStore.graphPath[0] ?? null)
const isAtRoot = computed(() => graphStore.graphPath.length <= 1)

function switchGraphTo(graphId: GraphId): void {
    uiStore.closeFloatingWindow()
    mediator.deactivate()
    graphStore.loadGraphToView(graphId)
}

function goUpOneLevel(): void {
    if (!parentGraphId.value) return
    closePanels()
    switchGraphTo(parentGraphId.value)
}

function goToRoot(): void {
    if (!currentRootId.value || isAtRoot.value) return
    closePanels()
    switchGraphTo(currentRootId.value)
}

function goToSegment(graphId: GraphId): void {
    closePanels()
    switchGraphTo(graphId)
}

// ── 全局事件 ──
function onDocumentPointerdown(event: PointerEvent): void {
    if (!hasOpenPanel.value) return
    if (cardElement.value?.contains(event.target as Node)) return
    closePanels()
}

function onDocumentKeydown(event: KeyboardEvent): void {
    // Ctrl/Cmd + K：打开搜索；已打开则关闭再打开以重新聚焦输入
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (activePanel.value !== 'search') {
            toggleSearchPanel()
        } else {
            closePanels()
            void nextTick(toggleSearchPanel)
        }
        return
    }

    if (event.key === 'Escape' && hasOpenPanel.value) {
        closePanels()
    }
}

function onWindowResize(): void {
    viewportHeight.value = window.innerHeight
    viewportWidth.value = window.innerWidth
    clampToViewport()
}

// ── 生命周期 ──
watch(cardElement, (element) => {
    if (element) {
        clampToViewport()
    }
})

onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerdown)
    document.addEventListener('keydown', onDocumentKeydown)
    window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerdown)
    document.removeEventListener('keydown', onDocumentKeydown)
    window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
    <div
        v-if="graphStore.graphView"
        ref="cardElement"
        class="nav-card"
        v-bind:class="{
            faded: isFaded,
            dragging: isDragging,
        }"
        v-bind:style="{ left: cardPosition.x + 'px', top: cardPosition.y + 'px' }"
        v-on:pointerenter="onPointerEnter"
        v-on:pointerleave="onPointerLeave"
    >
        <Dock
            v-bind:path-segments="pathSegments"
            v-bind:parent-graph-id="parentGraphId"
            v-bind:is-at-root="isAtRoot"
            v-bind:active-panel="activePanel"
            v-bind:drag-handlers="dragHandlers"
            v-on:go-parent-graph="goUpOneLevel"
            v-on:go-root-graph="goToRoot"
            v-on:go-segment-graph="goToSegment"
            v-on:toggle-search="toggleSearchPanel"
            v-on:toggle-navigation="toggleNavigationPanel"
        />

        <Transition v-bind:name="panelTransitionName">
            <NavigationPanel
                v-if="activePanel === 'navigation'"
                key="navigation"
                v-bind:current-root-id="currentRootId"
                v-bind:panel-opens-upward="panelOpensUpward"
                v-bind:panel-align-right="panelAlignRight"
                v-on:switch-root-graph="(id: GraphId) => switchGraphTo(id)"
                v-on:close="closePanels"
            />
            <SearchPanel
                v-else-if="activePanel === 'search'"
                key="search"
                v-bind:panel-opens-upward="panelOpensUpward"
                v-bind:panel-align-right="panelAlignRight"
                v-on:focus-element="(id: string) => uiStore.requestCanvasFocus(id)"
                v-on:close="closePanels"
            />
        </Transition>
    </div>
</template>

<style scoped>
.nav-card {
    position: absolute;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(6px);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 999;
    transition:
        left 0.25s ease,
        top 0.25s ease,
        opacity 0.4s ease,
        box-shadow 0.2s ease;
}

.nav-card.faded {
    opacity: 0.35;
}

.nav-card.dragging {
    transition:
        opacity 0.15s ease,
        box-shadow 0.2s ease;
    opacity: 0.6;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    user-select: none;
}

.nav-card.dragging :deep(.grip-handle) {
    color: #3b82f6;
    cursor: grabbing;
}

.panel-drop-enter-active,
.panel-drop-leave-active,
.panel-rise-enter-active,
.panel-rise-leave-active {
    transition: opacity 0.3s ease, transform 0.3s ease;
}

.panel-drop-enter-from,
.panel-drop-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}

.panel-rise-enter-from,
.panel-rise-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>
