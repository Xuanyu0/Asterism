<script lang="ts" setup>
/**
 * 导出选择弹窗：列出可导出的图谱树，用户选中一项即上报该树的导出请求。
 *
 * @remarks
 * 规则：
 * 1. 受控组件：显隐由父组件（NavigationPanel）经 visible 持有；本组件只上报
 *    selectRootGraph / close 事件，不自持显隐状态（数据向下流、事件向上流）。
 * 2. 列表经 rootInfos prop 传入，本组件不读 store 与用例层，也不触发导出本身。
 * 3. 层级：遮罩为 fixed + z-index 1000，严格高于既有最高浮层（999）；经 Teleport
 *    挂到 body——导航卡片带 backdrop-filter，会成为 fixed 后代的包含块，留在
 *    组件树内会相对卡片而非视口定位。
 * 4. 遮罩上停止 pointerdown / keydown.esc 冒泡：导航卡片的文档级监听把「卡片外
 *    点击」解释为关闭面板、把 Escape 解释为关闭面板，不拦截会导致弹窗刚交互
 *    就随面板卸载（导出请求发不出去）。
 */

import { ref, watch, nextTick } from 'vue'

import type { GraphId } from '@my-project/graph-engine'
import type { RootGraphInfo } from '@/graph/use-case/useNavigation'

import { ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

import AsterismLogo from '@/assets/icon-asterism.svg?component'

const props = defineProps<{
    visible: boolean
    rootInfos: RootGraphInfo[]
}>()

const emits = defineEmits<{
    selectRootGraph: [graphId: GraphId]
    close: []
}>()

// 弹窗卡片：打开时聚焦，键盘操作起点落在弹窗内（Tab 从弹窗内继续）
const dialogElement = ref<HTMLElement | null>(null)

watch(
    () => props.visible,
    (visible) => {
        if (!visible) return
        void nextTick(() => dialogElement.value?.focus())
    },
)
</script>

<template>
    <Teleport to="body">
        <Transition name="dialog-fade">
            <!--
                遮罩层：
                1. fixed 全屏 + z-index 1000 —— 严格高于既有最高浮层（999）。
                2. pointerdown 停止冒泡 —— 导航卡片的文档级规则会把「卡片外点击」
                   当作关闭面板，不拦截则点击弹窗时面板先卸载。
                3. 点击遮罩空白处关闭（click.self 只认遮罩自身，卡片内点击不受影响）。
                4. contextmenu 抑制与 Graph.vue 根容器一致 —— Teleport 后不在其子树内。
            -->
            <div
                v-if="visible"
                class="export-dialog-overlay"
                v-on:pointerdown.stop
                v-on:click.self="emits('close')"
                v-on:keydown.esc.stop="emits('close')"
                v-on:contextmenu.prevent
            >
                <div
                    ref="dialogElement"
                    class="export-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="graph-export-dialog-title"
                    tabindex="-1"
                >
                    <div class="export-dialog-header">
                        <div class="export-dialog-heading">
                            <h2 id="graph-export-dialog-title" class="export-dialog-title">导出图数据</h2>
                            <p class="export-dialog-subtitle">选择一棵图谱树，导出为 JSON 文件（含其全部子图）</p>
                        </div>
                        <button
                            type="button"
                            class="export-dialog-close"
                            v-bind:title="'关闭'"
                            v-on:click="emits('close')"
                        >
                            ×
                        </button>
                    </div>

                    <div class="panel-divider"></div>

                    <div v-if="rootInfos.length > 0" class="export-dialog-section-label">
                        根图谱（{{ rootInfos.length }}）
                    </div>

                    <ul v-if="rootInfos.length > 0" class="export-list">
                        <li v-for="info in rootInfos" v-bind:key="info.id">
                            <button
                                type="button"
                                class="export-item"
                                v-bind:title="'导出「' + info.title + '」'"
                                v-on:click="emits('selectRootGraph', info.id)"
                            >
                                <AsterismLogo class="export-item-icon size-3.5" />
                                <span class="export-item-title">{{ info.title }}</span>
                                <ArrowDownTrayIcon class="export-item-action size-3.5" />
                            </button>
                        </li>
                    </ul>

                    <div v-else class="export-empty">
                        <p class="export-empty-title">暂无可导出的根图谱</p>
                        <p class="export-empty-hint">请先新建一个根图谱</p>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/* ── 遮罩 ── */

.export-dialog-overlay {
    position: fixed;
    inset: 0;
    /* 置顶：既有最高为 999（导航卡片 / 模式选择器），通知面板为 998 */
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(15, 23, 42, 0.32);
}

/* ── 弹窗卡片 ── */

.export-dialog {
    width: 320px;
    max-width: 100%;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    outline: none;
}

.export-dialog-header {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
}

.export-dialog-heading {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.export-dialog-title {
    margin: 0;
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
}

.export-dialog-subtitle {
    margin: 0;
    color: #94a3b8;
    font-size: 11px;
    line-height: 1.5;
}

.export-dialog-close {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #94a3b8;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s;
}

.export-dialog-close:hover {
    background: #f1f5f9;
    color: #334155;
}

/* 分区标签：与 NavigationPanel 的 .panel-section-label 同规格 */
.export-dialog-section-label {
    padding: 0 2px;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
}

/* ── 图谱树列表 ── */

.export-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
}

.export-item {
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #334155;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition:
        background 0.15s,
        border-color 0.15s;
}

.export-item:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
}

.export-item:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.4);
    outline-offset: 1px;
}

.export-item-icon {
    flex-shrink: 0;
    color: #94a3b8;
}

.export-item:hover .export-item-icon {
    color: #3b82f6;
}

.export-item-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 行尾导出图标：常态低调，悬浮随行点亮（同 NavigationPanel 行操作按钮的显现语言） */
.export-item-action {
    flex-shrink: 0;
    transition: color 0.15s;
}

.export-item:hover .export-item-action {
    color: #3b82f6;
}

/* ── 空态 ── */

.export-empty {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 8px;
    text-align: center;
}

.export-empty-title {
    margin: 0;
    color: #64748b;
    font-size: 12px;
}

.export-empty-hint {
    margin: 0;
    color: #94a3b8;
    font-size: 11px;
}

/* ── 出入场：遮罩淡入淡出，卡片轻微上浮 ── */

.dialog-fade-enter-active,
.dialog-fade-leave-active {
    transition: opacity 0.18s ease;
}

.dialog-fade-enter-active .export-dialog,
.dialog-fade-leave-active .export-dialog {
    transition: transform 0.18s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
    opacity: 0;
}

.dialog-fade-enter-from .export-dialog,
.dialog-fade-leave-to .export-dialog {
    transform: translateY(8px) scale(0.98);
}

.panel-divider {
    height: 1px;
    margin: 2px 0;
    background: #e2e8f0;
}

</style>
