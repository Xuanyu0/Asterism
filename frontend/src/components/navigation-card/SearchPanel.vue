<script lang="ts" setup>
/**
 * 功能：
 *
 *     搜索面板——当前图内搜索。输入即时匹配节点/边标签，
 *     点击结果画布视口定位并高亮。
 *
 * 规则：
 *
 *     1. 空查询显示输入提示，不显示全量列表。
 *     2. Enter 快捷选中第一条结果。
 *     3. Escape 关闭面板（由编排器全局 handler 处理，本组件不再重复绑定）。
 *     4. 匹配只读 graphStore.graphView，不修改任何数据。
 *     5. 每次 v-if 重建时搜索状态自动重置（由编排器控制）。
 */

import { ref, computed, onMounted, nextTick } from 'vue'

import type { SearchResult } from './types';

import { useGraphStore } from '@/graph/graph_store'

defineProps<{
    panelOpensUpward: boolean
    panelAlignRight: boolean
}>()

const emit = defineEmits<{
    focusElement: [elementId: string]
    close: []
}>()

const graphStore = useGraphStore()

const searchQuery = ref('')
const searchInputElement = ref<HTMLInputElement | null>(null)

onMounted(() => {
    void nextTick(() => {
        searchInputElement.value?.focus()
    })
})

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

/**
 * 功能：
 *
 *     选中搜索结果：发送 focus-element 事件供编排器定位。
 */
function selectSearchResult(result: SearchResult): void {
    emit('focusElement', result.id)
    emit('close')
}

/** Enter 快捷选中第一条结果。 */
function onSearchInputEnter(): void {
    const first = searchResults.value[0]
    if (first) {
        selectSearchResult(first)
    }
}
</script>

<template>
    <div class="floating-panel" v-bind:class="{ 'opens-upward': panelOpensUpward, 'align-right': panelAlignRight }">
        <input
            ref="searchInputElement"
            v-model="searchQuery"
            type="text"
            class="text-input search-input"
            placeholder="搜索当前图谱中的节点 / 边…"
            maxlength="60"
            v-on:keydown.enter.prevent="onSearchInputEnter"
            v-on:keydown.escape="emit('close')"
        />

        <div v-if="searchQuery.trim().length === 0" class="search-hint">
            输入以匹配当前图谱中的节点 / 边标签
        </div>

        <div v-else-if="searchResults.length === 0" class="search-hint">
            无匹配结果
        </div>

        <ul v-else class="result-list">
            <li
                v-for="result in searchResults"
                v-bind:key="result.kind + '-' + result.id"
            >
                <button
                    type="button"
                    class="result-item"
                    v-on:click="selectSearchResult(result)"
                >
                    <span
                        class="result-dot"
                        v-bind:class="result.kind"
                    ></span>
                    <span class="result-item-title">{{ result.label }}</span>
                    <span class="result-kind">{{ result.kind === 'node' ? '节点' : '边' }}</span>
                </button>
            </li>
        </ul>
    </div>
</template>

<style scoped>
@import './panel-shared.css';

.search-hint {
    padding: 6px 8px;
    color: #94a3b8;
    font-size: 12px;
    text-align: center;
}

/* 结果列表 */
.result-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 220px;
    overflow-y: auto;
}

.result-list li {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
}

.result-item {
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

.result-item:hover {
    background: #f1f5f9;
}

.result-item-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>
