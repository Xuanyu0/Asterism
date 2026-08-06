<script lang="ts" setup>
/**
 * 功能：
 *
 *     导航面板——根图谱 CRUD 管理与占位入口。
 *     浮层，不参与 Dock 尺寸计算。
 *
 * 总体结构：
 *
 *     1. 根图谱列表（切换 + 删除带二次确认）
 *     2. 新建根图谱表单
 *     3. 占位入口：笔记库 / 常识层 / 设置
 *
 * 规则：
 *
 *     1. 面板展开时自动刷新根图谱列表。
 *     2. 根图谱列表点击即切换，当前根图带标记且不可删除。
 *     3. 删除需二次点击确认；当前根图不显示删除按钮。
 *     4. 笔记库 / 常识层 / 设置为占位按钮，功能延后。
 *     5. 本组件自管理 rootInfos / newRootTitle / armedDeleteId 状态。
 */

import { ref, computed, onMounted } from 'vue'

import type { GraphId } from '@my-project/graph-engine'

import { PlusIcon, TrashIcon, BookOpenIcon, GlobeAltIcon, Cog6ToothIcon } from '@heroicons/vue/24/outline'
import AsterismLogo from '@/assets/icon-asterism.svg?component'

import { useNavigationAdapter } from '@/graph/adapters/useNavigationAdapter'

import type { RootGraphInfo } from '@/graph/adapters/useNavigationAdapter'

const props = defineProps<{
    currentRootId: GraphId | null
    panelOpensUpward: boolean
    panelAlignRight: boolean
}>()

const emits = defineEmits<{
    switchRootGraph: [graphId: GraphId]
    close: []
}>()

const navigation = useNavigationAdapter()

// ── 根图谱列表 ──
const rootInfos = ref<RootGraphInfo[]>([])
/**
 * 功能：
 *
 *     从数据层重新拉取所有根图谱摘要。
 */
function refreshRootList(): void {
    rootInfos.value = navigation.listRootGraphInfos()
}
onMounted(() => {
    refreshRootList()
})

/**
 * 功能：
 *
 *     选择根图谱并切换。
 */
function selectRootGraph(info: RootGraphInfo): void {
    if (info.id !== props.currentRootId) {
        emits('switchRootGraph', info.id)
    }
    emits('close')
}

// ── 新建根图谱 ──
const newRootTitle = ref('')
const canCreate = computed(() => newRootTitle.value.trim().length > 0)
function createAndSwitch(): void {
    const title = newRootTitle.value.trim()
    if (!title) return

    const graphId = navigation.createRootGraph(title)
    newRootTitle.value = ''

    emits('switchRootGraph', graphId)
    refreshRootList()
    emits('close')
}

// ── 删除根图谱（二次点击确认）──
const armedDeleteId = ref<GraphId | null>(null)
/**
 * 功能：
 *
 *     删除根图谱入口。第一次点击进入待确认态，第二次点击执行级联删除。
 *
 * 规则：
 *
 *     1. 当前浏览中的根图不可删除。
 *     2. 确认后经导航适配层 deleteRootGraphTree 级联删除整棵图树。
 */
function requestDeleteRoot(info: RootGraphInfo): void {
    if (info.id === props.currentRootId) return

    if (armedDeleteId.value === info.id) {
        navigation.deleteRootGraphTree(info.id)
        armedDeleteId.value = null
        refreshRootList()
        return
    }

    armedDeleteId.value = info.id
}
</script>

<template>
    <div class="floating-panel" v-bind:class="{ 'opens-upward': panelOpensUpward, 'align-right': panelAlignRight }">
        <div class="panel-section-label">根图谱</div>

        <ul class="root-list">
            <li
                v-for="info in rootInfos"
                v-bind:key="info.id"
            >
                <button
                    type="button"
                    class="root-item"
                    v-bind:class="{ current: info.id === currentRootId }"
                    v-on:click="selectRootGraph(info)"
                >
                    <AsterismLogo class="size-3.5 root-item-icon" />
                    <span class="root-item-title">{{ info.title }}</span>
                    <span
                        v-if="info.id === currentRootId"
                        class="current-badge"
                    >当前</span>
                </button>
                <button
                    v-if="info.id !== currentRootId"
                    type="button"
                    class="root-delete-btn"
                    v-bind:class="{ armed: armedDeleteId === info.id }"
                    v-bind:title="armedDeleteId === info.id
                        ? '再次点击确认删除（含全部子图）'
                        : '删除图谱'"
                    v-on:click.stop="requestDeleteRoot(info)"
                >
                    <span v-if="armedDeleteId === info.id">确认</span>
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
</template>

<style scoped>
@import './panel-shared.css';

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

/* 删除按钮：行悬浮显现，确认态变红 */
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
</style>
