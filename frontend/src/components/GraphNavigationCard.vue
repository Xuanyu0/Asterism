<script lang="ts" setup>
/**
 * 功能：
 *
 *     导航卡片（Navigation Card）。画布上的图谱位置指示与导航中心。
 *     卡片可由用户拖拽摆放到任意位置，位置持久化保存。
 *
 * 总体结构：
 *
 *     1. Dock 行 — 拖拽手柄 / 返回上一级 / 根图 logo（一键回根图）/
 *        子图路径 / 搜索按钮 / 展开按钮
 *     2. 导航面板 — 根图谱列表（切换 / 删除）/ 新建根图谱 / 笔记库·常识层·设置（占位）
 *     3. 搜索面板 — 当前图内搜索：输入即时匹配节点/边标签，点击结果画布定位
 *     4. Hidden 态 — 沉浸模式预留，当前未实现
 *
 * 规则：
 *
 *     1. 本组件只读 graphStore 状态，所有图谱切换经 graphStore.loadGraphToView。
 *     2. 切换图谱前清理 UI 现场：关闭浮空窗、取消激活工具——它们持有旧图对象引用。
 *     3. 根图谱列表点击即切换：列表需显式展开，点击行为本身即确认。
 *     4. 当前浏览中的根图不可删除；删除根图级联删除其全部子图（二次点击确认）。
 *     5. 路径显示不下时右对齐截断、左端淡化；鼠标悬浮路径条展开完整路径。
 *     6. pointer 离开卡片 3s 后自动淡化；面板打开或拖拽中不淡化。
 *     7. 面板是 Dock 下方的浮层，不参与卡片尺寸计算——Dock 宽度永远稳定。
 *     8. 拖拽经 pointer capture 实现，事件不流向 Cytoscape 画布。
 *     9. 松手时距视口边缘 ≤32px 自动吸附（L1 视觉规范：边缘吸附）。
 *
 * 外部如何使用：
 *
 *     Graph.vue 挂载本组件。
 */

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

import type { GraphId } from '@my-project/graph-engine'

import {
    ChevronLeftIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    TrashIcon,
    BookOpenIcon,
    GlobeAltIcon,
    Cog6ToothIcon,
} from '@heroicons/vue/24/outline'

import AsterismLogo from '@/assets/icon-asterism.svg?component'

import { useGraphStore } from '@/graph/graph_store'
import type { RootGraphSummary } from '@/graph/graph_store'

import { useOperationController } from '@/ui/operation_controller'
import { useToolMediator } from '@/feature-tools/mediator'

const graphStore = useGraphStore()
const controller = useOperationController()
const mediator = useToolMediator()

interface CardPosition {
    x: number
    y: number
}

const cardPosition = ref<CardPosition>(loadPersistedCardPosition())
const cardElement = ref<HTMLElement | null>(null)
const isDragging = ref(false)

const DEFAULT_CARD_POSITION: CardPosition = { x: 52, y: 12 }
const CARD_POSITION_STORAGE_KEY = 'nav-card-position'
/**
 * 功能：
 *
 *     读取 localStorage 中持久化的卡片位置，数据缺失或损坏时回退默认位置。
 *
 * 规则：
 *
 *     1. 在 setup 阶段同步调用——首帧渲染即落在恢复位置，避免加载时滑动。
 *     2. 不做事口钳制——卡片尺寸未知，钳制由挂载后 clampCardToViewport 负责。
 */
function loadPersistedCardPosition(): CardPosition {
    try {
        const raw = localStorage.getItem(CARD_POSITION_STORAGE_KEY)
        if (raw) {
            const parsed: unknown = JSON.parse(raw)
            if (
                typeof parsed === 'object' && parsed !== null
                && 'x' in parsed && 'y' in parsed
                && typeof (parsed as Record<string, unknown>).x === 'number'
                && typeof (parsed as Record<string, unknown>).y === 'number'
            ) {
                return parsed as CardPosition
            }
        }
    } catch {
        // 损坏数据静默回退默认位置
    }
    return { ...DEFAULT_CARD_POSITION }
}

function saveCardPosition(): void {
    localStorage.setItem(CARD_POSITION_STORAGE_KEY, JSON.stringify(cardPosition.value))
}

/** 拖拽起点指针与卡片左上角的偏移。非响应式——仅拖拽会话内有效。 */
const dragPointerOffset = { x: 0, y: 0 }

/** 拖拽开始时测量的卡片尺寸，用于视口边界钳制与边缘吸附。 */
const dragCardSize = { width: 0, height: 0 }

// ── 卡片位置、拖拽、吸附 ──
/** 拖拽时卡片与视口四边的最小间距 */
const VIEWPORT_MARGIN = 8
/** 松手后吸附时，与边缘的最小间距 */
const SNAP_MARGIN = 12
/** 边缘自动对齐吸附阈值 */
const SNAP_THRESHOLD = 32

/**
 * 功能：
 *
 *     将坐标钳制在视口内（四周保留 VIEWPORT_MARGIN）。
 */
function clampToViewport(x: number, y: number, width: number, height: number): CardPosition {
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)

    return {
        x: Math.min(Math.max(x, VIEWPORT_MARGIN), maxX),
        y: Math.min(Math.max(y, VIEWPORT_MARGIN), maxY),
    }
}

/**
 * 功能：
 *
 *     以当前卡片实际尺寸钳制卡片位置。卡片渲染完成后与窗口 resize 时调用。
 */
function clampCardToViewport(): void {
    const card = cardElement.value
    if (!card) return

    cardPosition.value = clampToViewport(
        cardPosition.value.x,
        cardPosition.value.y,
        card.offsetWidth,
        card.offsetHeight,
    )
}

/**
 * 功能：
 *
 *     边缘吸附：距视口边缘 ≤ SNAP_THRESHOLD 的轴吸附到 SNAP_MARGIN。
 *
 * 规则：
 *
 *     1. L1文档 视觉规范：浮空 Button 边缘吸附。
 *     2. x / y 两轴独立判定，可只吸附一边（贴顶不贴左等）。
 */
function snapToViewportEdges(position: CardPosition): CardPosition {
    const { width, height } = dragCardSize
    let { x, y } = position

    if (x < SNAP_THRESHOLD) {
        x = SNAP_MARGIN
    } else if (x > window.innerWidth - width - SNAP_THRESHOLD) {
        x = window.innerWidth - width - SNAP_MARGIN
    }

    if (y < SNAP_THRESHOLD) {
        y = SNAP_MARGIN
    } else if (y > window.innerHeight - height - SNAP_THRESHOLD) {
        y = window.innerHeight - height - SNAP_MARGIN
    }

    return { x, y }
}

/**
 * 功能：
 *
 *     拖拽开始。pointer capture 锁定到手柄元素——后续 move/up 事件
 * 
 * 规则：
 * 
 *     全部定向到手柄，不流向 Cytoscape 画布，画布交互不受影响。
 */
function onGripPointerdown(event: PointerEvent): void {
    if (event.button !== 0) return

    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    event.preventDefault()

    const card = cardElement.value
    if (card) {
        dragCardSize.width = card.offsetWidth
        dragCardSize.height = card.offsetHeight
    }

    dragPointerOffset.x = event.clientX - cardPosition.value.x
    dragPointerOffset.y = event.clientY - cardPosition.value.y
    isDragging.value = true
}

/**
 * 功能：
 *
 *     拖拽中持续更新卡片位置。
 *
 * 规则：
 * 
 *     将当前指针坐标减去按下的偏移量得出卡片左上角坐标，
 *     经 clampToViewport 限制在视口内后写入 cardPosition。
 *
 */
function onGripPointermove(event: PointerEvent): void {
    if (!isDragging.value) return

    cardPosition.value = clampToViewport(
        event.clientX - dragPointerOffset.x,
        event.clientY - dragPointerOffset.y,
        dragCardSize.width,
        dragCardSize.height,
    )
}

/**
 * 功能：
 *
 *     拖拽结束：边缘吸附 + 持久化位置。
 *     pointerup 与 pointercancel 共用。
 */
function onGripPointerup(): void {
    if (!isDragging.value) return

    isDragging.value = false
    cardPosition.value = snapToViewportEdges(cardPosition.value)
    saveCardPosition()
}

// ── 面板状态 ──
/** 当前打开的浮动面板。'none' = 仅 Dock，无面板展开。 */
type PanelKind = 'none' | 'navigation' | 'search'

const activePanel = ref<PanelKind>('none')
const hasOpenPanel = computed(() => activePanel.value !== 'none')

function closePanels(): void {
    activePanel.value = 'none'
    armedDeleteId.value = null
}

function toggleNavigationPanel(): void {
    if (activePanel.value === 'navigation') {
        closePanels()
        return
    }

    refreshRootList()
    armedDeleteId.value = null
    activePanel.value = 'navigation'
}

// ── 面板翻转：卡片位于视口下部时面板向上展开 ──
const viewportHeight = ref(window.innerHeight)
const panelOpensUpward = computed(() => cardPosition.value.y > viewportHeight.value * 0.6)
const panelTransitionName = computed(() => (panelOpensUpward.value ? 'panel-rise' : 'panel-drop'))

// ── 路径与位置 ──
/** 路径段视图模型。graphPath（根→叶）逐段附带标题与当前段标记。 */
interface PathSegment {
    graphId: GraphId
    title: string
    isCurrent: boolean
}

const pathSegments = computed<PathSegment[]>(() => {
    const path = graphStore.graphPath

    return path.map((graphId, index) => ({
        graphId,
        title: graphStore.getGraphById(graphId)?.title ?? '未命名',
        isCurrent: index === path.length - 1,
    }))
})

const parentGraphId = computed(() => graphStore.graphView?.parentGraphId ?? null)
const currentRootId = computed(() => graphStore.graphPath[0] ?? null)
const isAtRoot = computed(() => graphStore.graphPath.length <= 1)

/**
 * 功能：
 *
 *     切换画布视图到目标图谱，并清理 UI 现场。
 *
 * 规则：
 *
 *     1. 图谱切换的唯一入口是 graphStore.loadGraphToView。
 *     2. 切换前关闭浮空窗、取消激活工具——它们持有旧图节点/边的引用。
 *     3. 加载失败由 loadGraphToView 写入 lastValidationResult，
 *        经 Graph.vue 的 NotificationPanel 统一展示。
 */
function switchGraphTo(graphId: GraphId): void {
    controller.closeFloatingWindow()
    mediator.deactivate()
    graphStore.loadGraphToView(graphId)
}

function goUpOneLevel(): void {
    if (!parentGraphId.value) return
    switchGraphTo(parentGraphId.value)
}

function goToRoot(): void {
    if (!currentRootId.value || isAtRoot.value) return
    switchGraphTo(currentRootId.value)
}

function goToSegment(segment: PathSegment): void {
    if (segment.isCurrent) return
    closePanels()
    switchGraphTo(segment.graphId)
}

// ── 导航面板：根图谱列表 ──
const rootSummaries = ref<RootGraphSummary[]>([])

/**
 * 功能：
 *
 *     从数据层重新拉取所有根图谱摘要，覆盖当前列表缓存。
 *
 * 规则：
 *
 *     - 在面板展开与本地图谱增删后调用。
 */
function refreshRootList(): void {
    rootSummaries.value = graphStore.listRootGraphSummaries()
}
/**
 * 功能：
 * 
 *     根据summary的id字段跳转到选择的对应的图谱
 * 
 */
function selectRootGraph(summary: RootGraphSummary): void {
    if (summary.id !== currentRootId.value) {
        switchGraphTo(summary.id)
    }
    closePanels()
}

// ── 导航面板：新建根图谱 ──
const newRootTitle = ref('')
const canCreate = computed(() => newRootTitle.value.trim().length > 0)

function createAndSwitch(): void {
    const title = newRootTitle.value.trim()
    if (!title) return

    const graphId = graphStore.createRootGraph(title)
    newRootTitle.value = ''

    switchGraphTo(graphId)
    refreshRootList()
    closePanels()
}

// ── 导航面板：删除根图谱（二次点击确认，与删除工具交互一致）──
const armedDeleteId = ref<GraphId | null>(null)

/**
 * 功能：
 *
 *     删除根图谱入口。第一次点击进入待确认态，第二次点击执行级联删除。
 *
 * 规则：
 *
 *     1. 当前浏览中的根图不可删除（视图会失去持久化副本）。
 *     2. 确认后调用 graphStore.deleteRootGraphTree 级联删除整棵图树。
 */
function requestDeleteRoot(summary: RootGraphSummary): void {
    if (summary.id === currentRootId.value) return

    if (armedDeleteId.value === summary.id) {
        graphStore.deleteRootGraphTree(summary.id)
        armedDeleteId.value = null
        refreshRootList()
        return
    }

    armedDeleteId.value = summary.id
}

// ── 搜索面板：当前图内搜索 ── 
const searchQuery = ref('')
const searchInputElement = ref<HTMLInputElement | null>(null)

/** 搜索结果视图模型。kind 用于左侧类型标识与右侧标签。 */
interface SearchResult {
    id: string
    kind: 'node' | 'edge'
    label: string
}

/**
 * 功能：
 *
 *     在当前图谱的节点/边标签中做包含匹配（大小写不敏感），最多返回 8 条。
 *
 * 规则：
 *
 *     1. 只读 graphStore.graphView，不修改任何数据。
 *     2. 空查询返回空数组——面板显示输入提示而非全量列表。
 */
const searchResults = computed<SearchResult[]>(() => {
    const query = searchQuery.value.trim().toLowerCase()
    const graph = graphStore.graphView

    if (!query || !graph) return []

    const matched: SearchResult[] = []

    for (const node of graph.nodes) {
        if (node.label.toLowerCase().includes(query)) {
            matched.push({ id: node.id, kind: 'node', label: node.label })
        }
    }

    for (const edge of graph.edges) {
        if (edge.label && edge.label.toLowerCase().includes(query)) {
            matched.push({ id: edge.id, kind: 'edge', label: edge.label })
        }
    }

    return matched.slice(0, 8)
})

function toggleSearchPanel(): void {
    if (activePanel.value === 'search') {
        closePanels()
        return
    }

    searchQuery.value = ''
    activePanel.value = 'search'

    void nextTick(() => {
        searchInputElement.value?.focus()
    })
}

/**
 * 功能：
 *
 *     选中搜索结果：请求画布定位到该元素并关闭面板。
 *     定位执行链路：ui_store 意图 → Graph.vue 消费 → renderer.revealElement。
 */
function selectSearchResult(result: SearchResult): void {
    controller.requestCanvasFocus(result.id)
    closePanels()
}

/** Enter 快捷选中第一条结果。 */
function onSearchInputEnter(): void {
    const first = searchResults.value[0]
    if (first) {
        selectSearchResult(first)
    }
}

// ── 面板外点击 / 键盘 ──
function onDocumentPointerdown(event: PointerEvent): void {
    if (!hasOpenPanel.value) return
    if (cardElement.value?.contains(event.target as Node)) return
    closePanels()
}

function onDocumentKeydown(event: KeyboardEvent): void {
    // Ctrl/Cmd + K：打开搜索（Notion / VSCode 惯例）；已打开则重新聚焦输入框
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (activePanel.value !== 'search') {
            toggleSearchPanel()
        } else {
            searchInputElement.value?.focus()
        }
        return
    }

    if (event.key === 'Escape' && hasOpenPanel.value) {
        closePanels()
    }
}

// ── 自动淡化：pointer 离开 3s 后淡化，面板打开或拖拽中不淡化 ──
const isFaded = ref(false)
let fadeTimer: ReturnType<typeof setTimeout> | null = null

function clearFadeTimer(): void {
    if (fadeTimer !== null) {
        clearTimeout(fadeTimer)
        fadeTimer = null
    }
}

function onCardPointerEnter(): void {
    clearFadeTimer()
    isFaded.value = false
}

function onCardPointerLeave(): void {
    clearFadeTimer()
    if (hasOpenPanel.value || isDragging.value) return

    fadeTimer = setTimeout(() => {
        isFaded.value = true
    }, 3000)
}

watch(hasOpenPanel, (open) => {
    if (open) {
        clearFadeTimer()
        isFaded.value = false
    } else {
        // 面板关闭后重启 fade timer（若指针恰在卡片外）
        clearFadeTimer()
        if (!isDragging.value) {
            fadeTimer = setTimeout(() => {
                isFaded.value = true
            }, 3000)
        }
    }
})

// ── 路径截断检测：仅真正溢出时施加左端淡化 ──

const pathStripElement = ref<HTMLElement | null>(null)
const isPathTruncated = ref(false)

/**
 * 功能：
 *
 *     测量路径条是否溢出，决定是否施加左端淡化遮罩。
 *
 * 规则：
 *
 *     1. scrollWidth > clientWidth 判定溢出，1px 容差吸收亚像素舍入。
 *     2. nextTick 后测量——路径变化先完成 DOM 更新。
 */
async function measurePathTruncation(): Promise<void> {
    await nextTick()

    const element = pathStripElement.value
    if (!element) {
        isPathTruncated.value = false
        return
    }

    isPathTruncated.value = element.scrollWidth > element.clientWidth + 1
}

watch(pathSegments, () => {
    void measurePathTruncation()
})

function onWindowResize(): void {
    viewportHeight.value = window.innerHeight
    clampCardToViewport()
    void measurePathTruncation()
}

// ── 生命周期 ──

// 卡片渲染完成（graphView 就绪）后做首次视口钳制——
// 恢复持久化位置时窗口可能已缩小，卡片尺寸此时才可测量。
watch(cardElement, (element) => {
    if (element) {
        clampCardToViewport()
    }
})

onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerdown)
    document.addEventListener('keydown', onDocumentKeydown)
    window.addEventListener('resize', onWindowResize)
    void measurePathTruncation()
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerdown)
    document.removeEventListener('keydown', onDocumentKeydown)
    window.removeEventListener('resize', onWindowResize)
    clearFadeTimer()
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
            'panel-upward': panelOpensUpward,
        }"
        v-bind:style="{ left: cardPosition.x + 'px', top: cardPosition.y + 'px' }"
        v-on:pointerenter="onCardPointerEnter"
        v-on:pointerleave="onCardPointerLeave"
    >
        <!--
            功能：
                Dock 行——常驻可见的位置与导航条。

            规则：
                1. 拖拽手柄在最左端，hover 显示 grab 光标，拖拽中卡片半透明。
                2. 返回上一级在根图时禁用；logo 始终点亮（品牌锚点），根图时点击为空操作。
                3. 路径段除当前段外均可点击跳转。
        -->
        <div class="dock-row">
            <div
                class="grip-handle"
                v-bind:title="'拖拽移动卡片'"
                v-on:pointerdown="onGripPointerdown"
                v-on:pointermove="onGripPointermove"
                v-on:pointerup="onGripPointerup"
                v-on:pointercancel="onGripPointerup"
            >
                <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                    <circle cx="2.5" cy="3" r="1.3" />
                    <circle cx="7.5" cy="3" r="1.3" />
                    <circle cx="2.5" cy="8" r="1.3" />
                    <circle cx="7.5" cy="8" r="1.3" />
                    <circle cx="2.5" cy="13" r="1.3" />
                    <circle cx="7.5" cy="13" r="1.3" />
                </svg>
            </div>

            <button
                type="button"
                class="icon-btn"
                v-bind:disabled="!parentGraphId"
                v-bind:title="'返回上一级'"
                v-on:click="goUpOneLevel"
            >
                <ChevronLeftIcon class="size-4" />
            </button>

            <button
                type="button"
                class="icon-btn logo-btn"
                v-bind:title="isAtRoot ? 'Asterism · 当前已在根图谱' : '返回根图谱'"
                v-on:click="goToRoot"
            >
                <AsterismLogo class="size-4" />
            </button>

            <div class="dock-divider"></div>

            <div
                ref="pathStripElement"
                class="path-strip"
                v-bind:class="{ truncated: isPathTruncated }"
            >
                <template
                    v-for="(segment, index) in pathSegments"
                    v-bind:key="segment.graphId"
                >
                    <span v-if="index > 0" class="path-separator">›</span>
                    <span
                        v-if="segment.isCurrent"
                        class="path-segment current"
                    >{{ segment.title }}</span>
                    <button
                        v-else
                        type="button"
                        class="path-segment ancestor"
                        v-bind:title="'跳转到 ' + segment.title"
                        v-on:click="goToSegment(segment)"
                    >{{ segment.title }}</button>
                </template>
            </div>

            <button
                type="button"
                class="icon-btn"
                v-bind:class="{ active: activePanel === 'search' }"
                v-bind:title="'搜索当前图谱（Ctrl+K）'"
                v-on:click="toggleSearchPanel"
            >
                <MagnifyingGlassIcon class="size-4" />
            </button>

            <button
                type="button"
                class="icon-btn"
                v-bind:title="activePanel === 'navigation' ? '收起导航面板' : '展开导航面板'"
                v-on:click="toggleNavigationPanel"
            >
                <ChevronDownIcon
                    class="size-4 chevron-icon"
                    v-bind:class="{ rotated: activePanel === 'navigation' }"
                />
            </button>
        </div>

        <!--
            功能：
                导航面板——根图谱管理与占位入口。浮层，不参与 Dock 尺寸计算。

            规则：
                1. 根图谱列表点击即切换，当前根图带标记。
                2. 删除需二次点击确认；当前根图不显示删除按钮。
                3. 笔记库 / 常识层 / 设置为占位按钮，功能延后。
        -->
        <Transition v-bind:name="panelTransitionName">
            <div v-if="activePanel === 'navigation'" key="navigation" class="floating-panel">
                <div class="panel-section-label">根图谱</div>

                <ul class="root-list">
                    <li
                        v-for="summary in rootSummaries"
                        v-bind:key="summary.id"
                    >
                        <button
                            type="button"
                            class="root-item"
                            v-bind:class="{ current: summary.id === currentRootId }"
                            v-on:click="selectRootGraph(summary)"
                        >
                            <AsterismLogo class="size-3.5 root-item-icon" />
                            <span class="root-item-title">{{ summary.title }}</span>
                            <span
                                v-if="summary.id === currentRootId"
                                class="current-badge"
                            >当前</span>
                        </button>
                        <button
                            v-if="summary.id !== currentRootId"
                            type="button"
                            class="root-delete-btn"
                            v-bind:class="{ armed: armedDeleteId === summary.id }"
                            v-bind:title="armedDeleteId === summary.id
                                ? '再次点击确认删除（含全部子图）'
                                : '删除图谱'"
                            v-on:click.stop="requestDeleteRoot(summary)"
                        >
                            <span v-if="armedDeleteId === summary.id">确认</span>
                            <TrashIcon v-else class="size-3.5" />
                        </button>
                    </li>
                </ul>

                <form class="create-row" v-on:submit.prevent="createAndSwitch">
                    <input
                        v-model="newRootTitle"
                        type="text"
                        class="text-input"
                        placeholder="新根图谱名称…"
                        maxlength="40"
                    />
                    <button
                        type="submit"
                        class="create-btn"
                        v-bind:disabled="!canCreate"
                        v-bind:title="'创建并切换'"
                    >
                        <PlusIcon class="size-4" />
                    </button>
                </form>

                <div class="panel-divider"></div>

                <div class="placeholder-row">
                    <button
                        type="button"
                        class="btn-secondary placeholder-btn"
                        disabled
                        v-bind:title="'笔记库 — 后续阶段'"
                    >
                        <BookOpenIcon class="size-4" />
                        <span>笔记库</span>
                    </button>
                    <button
                        type="button"
                        class="btn-secondary placeholder-btn"
                        disabled
                        v-bind:title="'常识层 — 后续阶段'"
                    >
                        <GlobeAltIcon class="size-4" />
                        <span>常识层</span>
                    </button>
                    <button
                        type="button"
                        class="btn-secondary placeholder-btn"
                        disabled
                        v-bind:title="'设置 — 后续阶段'"
                    >
                        <Cog6ToothIcon class="size-4" />
                        <span>设置</span>
                    </button>
                </div>
            </div>

            <!--
                功能：
                    搜索面板——当前图内搜索。输入即时匹配节点/边标签，
                    点击结果画布视口定位并高亮。

                规则：
                    1. 空查询显示输入提示，不显示全量列表。
                    2. Enter 快捷选中第一条结果。
                    3. 匹配只读 graphStore.graphView，不修改任何数据。
            -->
            <div v-else-if="activePanel === 'search'" key="search" class="floating-panel">
                <input
                    ref="searchInputElement"
                    v-model="searchQuery"
                    type="text"
                    class="text-input search-input"
                    placeholder="搜索当前图谱中的节点 / 边…"
                    maxlength="60"
                    v-on:keydown.enter.prevent="onSearchInputEnter"
                    v-on:keydown.escape="closePanels"
                />

                <div v-if="searchQuery.trim().length === 0" class="search-hint">
                    输入以匹配当前图谱中的节点 / 边标签
                </div>

                <div v-else-if="searchResults.length === 0" class="search-hint">
                    无匹配结果
                </div>

                <ul v-else class="root-list">
                    <li
                        v-for="result in searchResults"
                        v-bind:key="result.kind + '-' + result.id"
                    >
                        <button
                            type="button"
                            class="root-item"
                            v-on:click="selectSearchResult(result)"
                        >
                            <span
                                class="result-dot"
                                v-bind:class="result.kind"
                            ></span>
                            <span class="root-item-title">{{ result.label }}</span>
                            <span class="result-kind">{{ result.kind === 'node' ? '节点' : '边' }}</span>
                        </button>
                    </li>
                </ul>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
/* ── 卡片容器（位置由拖拽决定，style 绑定 left/top）── */

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

/* 拖拽中：位置即时跟随（去掉 left/top 过渡），半透明 + 阴影加深 */
.nav-card.dragging {
    transition:
        opacity 0.15s ease,
        box-shadow 0.2s ease;
    opacity: 0.6;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    user-select: none;
}

/* ── Dock 行 ── */

.dock-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
    padding: 3px 6px 3px 2px;
}

/* 拖拽手柄：六点握把，常态低调，悬浮显现 */
.grip-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 5px;
    color: #cbd5e1;
    cursor: grab;
    touch-action: none;
    transition: color 0.15s, background 0.15s;
}

.nav-card:hover .grip-handle {
    color: #94a3b8;
}

.grip-handle:hover {
    background: #f1f5f9;
    color: #64748b;
}

.nav-card.dragging .grip-handle {
    color: #3b82f6;
    cursor: grabbing;
}

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 5px;
    color: #475569;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
}

.icon-btn:hover:not(:disabled) {
    background: #f1f5f9;
    color: #1e293b;
}

.icon-btn:disabled {
    color: #cbd5e1;
    cursor: not-allowed;
}

.icon-btn.active {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #2563eb;
}

/* 根图 logo：品牌锚点，始终点亮 */
.logo-btn {
    color: #3b82f6;
}

.logo-btn:hover:not(:disabled) {
    background: #eff6ff;
    color: #2563eb;
}

/* 展开箭头：旋转过渡代替图标切换 */
.chevron-icon {
    transition: transform 0.25s ease;
}

.chevron-icon.rotated {
    transform: rotate(180deg);
}

.dock-divider {
    width: 1px;
    height: 16px;
    background: #e2e8f0;
    margin: 0 4px;
    flex-shrink: 0;
}

/* ── 路径条：右对齐截断左端，截断时左端淡化，悬浮展开完整路径 ── */

.path-strip {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    overflow: hidden;
    max-width: min(280px, 30vw);
    padding: 0 4px;
    transition: max-width 0.3s ease;
}

.path-strip.truncated {
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 32px);
    mask-image: linear-gradient(to right, transparent 0, #000 32px);
}

.path-strip:hover {
    max-width: min(560px, 60vw);
    -webkit-mask-image: none;
    mask-image: none;
}

.path-segment {
    flex-shrink: 0;
    padding: 0 2px;
    font-size: 13px;
    line-height: 26px;
    white-space: nowrap;
}

.path-segment.ancestor {
    border: none;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
}

.path-segment.ancestor:hover {
    color: #1e293b;
    background: #f1f5f9;
}

.path-segment.current {
    color: #0f172a;
    font-weight: 600;
}

.path-separator {
    flex-shrink: 0;
    color: #cbd5e1;
    font-size: 12px;
    user-select: none;
}

/* ── 浮层面板：Dock 下方弹出，不参与卡片尺寸计算（Dock 宽度永远稳定）── */

.floating-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 288px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(6px);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

/* 卡片位于视口下部时，面板向上展开 */
.nav-card.panel-upward .floating-panel {
    top: auto;
    bottom: calc(100% + 6px);
}

.panel-section-label {
    padding: 0 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #94a3b8;
}

.root-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 220px;
    overflow-y: auto;
}

.root-list li {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
}

.root-item {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 6px;
    color: #334155;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
}

.root-item:hover {
    background: #f1f5f9;
}

.root-item.current {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1d4ed8;
    font-weight: 600;
}

.root-item-icon {
    flex-shrink: 0;
    color: #94a3b8;
}

.root-item.current .root-item-icon {
    color: #3b82f6;
}

.root-item-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.current-badge {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 999px;
    background: #dbeafe;
    color: #3b82f6;
    font-size: 10px;
    font-weight: 600;
}

/* 删除按钮：行悬浮显现，确认态变红（与删除工具的二次确认交互一致） */

.root-delete-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 4px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 5px;
    color: #94a3b8;
    font-size: 11px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.root-list li:hover .root-delete-btn,
.root-delete-btn.armed {
    opacity: 1;
}

.root-delete-btn:hover {
    background: #fef2f2;
    color: #dc2626;
}

.root-delete-btn.armed {
    background: #dc2626;
    border-color: #dc2626;
    color: #ffffff;
    font-weight: 600;
}

/* ── 输入框（新建根图谱 / 搜索共用）── */

.text-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #1e293b;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.text-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.create-row {
    display: flex;
    flex-direction: row;
    gap: 6px;
}

.create-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    border: 1px solid #3b82f6;
    border-radius: 6px;
    background: #3b82f6;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s;
}

.create-btn:hover:not(:disabled) {
    background: #2563eb;
}

.create-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* ── 搜索面板 ── */

.search-input {
    width: 100%;
}

.search-hint {
    padding: 6px 8px;
    color: #94a3b8;
    font-size: 12px;
    text-align: center;
}

/* 结果类型标识：节点为圆点，边为短线——与画布视觉语言一致 */
.result-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #3b82f6;
}

.result-dot.edge {
    width: 10px;
    height: 2px;
    border-radius: 1px;
    background: #94a3b8;
}

.result-kind {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 10px;
}

/* ── 占位入口 ── */

.panel-divider {
    height: 1px;
    margin: 2px 0;
    background: #e2e8f0;
}

.placeholder-row {
    display: flex;
    flex-direction: row;
    gap: 6px;
}

.placeholder-btn {
    flex: 1 1 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 4px;
    border-radius: 6px;
    font-size: 12px;
}

/* ── 面板弹出动效（300ms 滑动；向上/向下两个方向）── */

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
