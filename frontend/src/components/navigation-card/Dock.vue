<script lang="ts" setup>
/**
 * 功能：
 *
 *     导航卡片的 Dock 行——常驻可见的位置与导航条。
 *     包含：拖拽手柄、返回按钮、图标、面包屑路径条、搜索按钮、分隔线、导航面板按钮。
 *
 * 总体结构：
 *
 *     1. 拖拽手柄（六点握把）— pointer 事件绑定外部传入的 dragHandlers
 *     2. 返回按钮 — 返回上一级图谱（根图时 disabled）
 *     3. 根图谱图标按钮 — 返回根图谱
 *     4. 面包屑路径条 — 逐段展示当前路径，祖先段可点击跳转
 *     5. 搜索按钮 — 切换搜索面板
 *     6. 展开按钮 — 切换导航面板
 *
 * 规则：
 *
 *     1. 四个导航 emit（goParentGraph / goRootGraph / goSegmentGraph）由编排器统一映射到 switchGraphTo。
 *     2. Dock 内部自己算出 goParentGraph / goRootGraph 的 graphId。
 *     3. 内部使用 useOverflowDetection 管理路径截断检测，watch pathSegments 触发重测。
 *     4. 不向编排器暴露 isOverflowing 或 pathStripElement——编排器无需关心截断状态。
 */

import { watch, onMounted, ref } from 'vue'
import { ChevronLeftIcon, ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'

import type { GraphId } from '@my-project/graph-engine'

import type { PanelKind, PathSegment } from './types'

import AsterismLogo from '@/assets/icon-asterism.svg?component'
import { useOverflowDetection } from '@/composables/useOverflowDetection'

const props = defineProps<{
    pathSegments: PathSegment[]
    parentGraphId: GraphId | null
    isAtRoot: boolean
    activePanel: PanelKind
    dragHandlers: {
        onPointerdown: (e: PointerEvent) => void
        onPointermove: (e: PointerEvent) => void
        onPointerup: (e: PointerEvent) => void
    }
}>()

const emits = defineEmits<{
    goParentGraph: []
    goRootGraph: []
    goSegmentGraph: [graphId: GraphId]
    toggleSearch: []
    toggleNavigation: []
}>()

// ── 路径截断检测 ──
const pathStripElement = ref<HTMLElement | null>(null)
const { isOverflowing: isPathTruncated, measure } = useOverflowDetection(pathStripElement)

onMounted(() => {
    void measure()
})

watch(() => props.pathSegments, () => {
    void measure()
})

</script>

<template>
    <div class="dock-row">
        <div
            class="grip-handle"
            v-bind:title="'拖拽移动卡片'"
            v-on:pointerdown="dragHandlers.onPointerdown"
            v-on:pointermove="dragHandlers.onPointermove"
            v-on:pointerup="dragHandlers.onPointerup"
            v-on:pointercancel="dragHandlers.onPointerup"
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
            v-on:click="emits('goParentGraph')"
        >
            <ChevronLeftIcon class="size-4" />
        </button>

        <button
            type="button"
            class="icon-btn logo-btn"
            v-bind:title="isAtRoot ? 'Asterism · 当前已在根图谱' : '返回根图谱'"
            v-on:click="emits('goRootGraph')"
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
                    v-on:click="emits('goSegmentGraph', segment.graphId)"
                >{{ segment.title }}</button>
            </template>
        </div>

        <button
            type="button"
            class="icon-btn"
            v-bind:class="{ active: activePanel === 'search' }"
            v-bind:title="'搜索当前图谱（Ctrl+K）'"
            v-on:click="emits('toggleSearch')"
        >
            <MagnifyingGlassIcon class="size-4" />
        </button>

        <div class="dock-divider"></div>

        <button
            type="button"
            class="icon-btn"
            v-bind:title="activePanel === 'navigation' ? '收起导航面板' : '展开导航面板'"
            v-on:click="emits('toggleNavigation')"
        >
            <ChevronDownIcon
                class="size-4 chevron-icon"
                v-bind:class="{ rotated: activePanel === 'navigation' }"
            />
        </button>
    </div>
</template>

<style scoped>
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

.dock-row:hover .grip-handle {
    color: #94a3b8;
}

.grip-handle:hover {
    background: #f1f5f9;
    color: #64748b;
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

/* 根图图标：始终点亮 */
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
</style>
