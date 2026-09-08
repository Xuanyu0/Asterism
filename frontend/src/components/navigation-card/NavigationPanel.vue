<script lang="ts" setup>
/**
 * 导航面板：根图谱的列表管理（切换 / 重命名 / 级联删除）与占位入口。浮层，不参与 Dock 尺寸计算。
 *
 * @remarks
 * 规则：
 * 1. 面板每次展开（组件挂载）自动刷新根图谱列表。
 * 2. 点击根图谱即切换；"当前"图以蓝色高亮区分（无文字徽标）。
 * 3. 更名 = 行内编辑：点击铅笔进入输入态（预填 + 聚焦），Enter / 失焦确认，Esc 取消。
 * 4. 删除需二次点击确认；当前根图不渲染删除按钮（更名按钮仍渲染，更名对当前根图允许）。
 * 5. 编辑态与删除 armed 态互斥：同一行同一时刻只处于一种操作状态。
 * 6. 本组件自管理 rootInfos / newRootTitle / editingId / editTitle / armedDeleteId / noticeText 状态。
 */

import { ref, computed, onMounted, nextTick } from 'vue'

import type { GraphId } from '@my-project/graph-engine'
import type { RootGraphInfo } from '@/graph/use-case/useNavigation'

import { PlusIcon, TrashIcon, PencilIcon, BookOpenIcon, GlobeAltIcon, Cog6ToothIcon } from '@heroicons/vue/24/outline'
import AsterismLogo from '@/assets/icon-asterism.svg?component'

import { useNavigation } from '@/graph/use-case/useNavigation'

// ── 常量（新建与更名流程共用） ──
const ROOT_TITLE_MAX_LENGTH = 40
const DUPLICATE_TITLE_NOTICE = '已存在同名根图谱'

const props = defineProps<{
    currentRootId: GraphId | null
    panelOpensUpward: boolean
    panelAlignRight: boolean
}>()

const emits = defineEmits<{
    switchRootGraph: [graphId: GraphId]
    close: []
}>()

const navigation = useNavigation()

// 新建 + 重命名共用的轻量提示文本（空名 / 重名 / 失败拦截反馈）
const noticeText = ref('')

// ── 根图谱列表 ──
const rootInfos = ref<RootGraphInfo[]>([])
function refreshRootList(): void {
    rootInfos.value = navigation.listRootGraphInfos()
}
onMounted(() => {
    refreshRootList()
})

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

    // 重名预检：createRootGraph 无失败信号通道（重名时拒绝创建但返回请求 ID），由 UI 先行拦截
    // trim 语义与用例层一致：对已有标题与输入均 trim 后比较
    if (rootInfos.value.some((info) => info.title.trim() === title.trim())) {
        noticeText.value = DUPLICATE_TITLE_NOTICE
        return
    }

    const graphId = navigation.createRootGraph(title)
    newRootTitle.value = ''
    noticeText.value = ''

    emits('switchRootGraph', graphId)
    refreshRootList()
    emits('close')
}

// ── 删除根图谱（二次点击确认）──
const armedDeleteId = ref<GraphId | null>(null)
/**
 * 删除根图谱入口。第一次点击进入待确认态，第二次点击执行级联删除。
 *
 * @remarks
 * 1. 当前浏览中的根图不可删除。
 * 2. 确认后经导航用例层 deleteRootGraphTree 级联删除整棵图树。
 * 3. 与行内编辑互斥：任何删除点击先取消编辑态（编辑内容不提交）。
 */
function requestDeleteRoot(info: RootGraphInfo): void {
    if (info.id === props.currentRootId) return

    // 互斥：点击删除时清空编辑态（行内编辑的失焦确认对操作按钮跳过，此处显式取消）
    cancelRename()

    if (armedDeleteId.value === info.id) {
        navigation.deleteRootGraphTree(info.id)
        armedDeleteId.value = null
        refreshRootList()
        return
    }

    armedDeleteId.value = info.id
}

// ── 重命名根图谱（行内编辑）──
const editingId = ref<GraphId | null>(null)
const editTitle = ref('')
const editInputEl = ref<HTMLInputElement | null>(null)

/**
 * 进入某行的行内编辑态：预填当前标题并在下一帧聚焦输入框。
 *
 * @remarks
 * 与删除 armed 态互斥：进入编辑清空 armedDeleteId（同一行同一时刻只处于一种操作状态）。
 *
 * @param info - 目标根图谱列表项
 */
function startRename(info: RootGraphInfo): void {
    editingId.value = info.id
    editTitle.value = info.title
    noticeText.value = ''
    armedDeleteId.value = null
    void nextTick(() => editInputEl.value?.focus())
}

function cancelRename(): void {
    editingId.value = null
    editTitle.value = ''
    noticeText.value = ''
}

/**
 * 提交行内更名：空名本地拦截（保持编辑态 + 轻量提示，不提交）；
 * 重名由引擎 update_graph 校验返回 TITLE_DUPLICATE issue（保持编辑态）；
 * 成功（validation.valid）退出编辑态并刷新列表。
 */
function confirmRename(): void {
    const targetId = editingId.value
    if (targetId === null) return

    const title = editTitle.value.trim()
    if (!title) {
        noticeText.value = '名称不能为空'
        return
    }

    const validation = navigation.renameRootGraph(targetId, title)
    if (validation.valid) {
        cancelRename()
        refreshRootList()
        return
    }

    // 失败（含引擎 EMPTY_TITLE / TITLE_DUPLICATE）：保持编辑态 + 按 issue 提示
    if (validation.issues.some((issue) => issue.code === 'TITLE_DUPLICATE')) {
        noticeText.value = DUPLICATE_TITLE_NOTICE
        return
    }
    if (validation.issues.some((issue) => issue.code === 'EMPTY_TITLE')) {
        noticeText.value = '名称不能为空'
        return
    }
    noticeText.value = '重命名失败，请重试'
}

/**
 * 输入框失焦确认。
 *
 * @remarks
 * 焦点移到行操作按钮（铅笔 / 删除）时不提交——点击铅笔会切换编辑目标、
 * 点击删除会取消编辑（requestDeleteRoot），提前提交会误改标题。
 */
function onRenameBlur(event: FocusEvent): void {
    if (editingId.value === null) return

    const next = event.relatedTarget as HTMLElement | null
    if (next && next.closest('.root-rename-btn, .root-delete-btn')) return

    confirmRename()
}
</script>

<template>
    <div
        class="floating-panel"
        v-bind:class="{
            'opens-upward': panelOpensUpward,
            'align-right': panelAlignRight,
        }"
    >
        <div class="panel-section-label">根图谱</div>

        <ul class="root-list">
            <li v-for="info in rootInfos" v-bind:key="info.id">
                <button
                    v-if="editingId !== info.id"
                    type="button"
                    class="root-item"
                    v-bind:class="{ current: info.id === currentRootId }"
                    v-on:click="selectRootGraph(info)"
                >
                    <AsterismLogo class="root-item-icon size-3.5" />
                    <span class="root-item-title">{{ info.title }}</span>
                </button>
                <span v-else class="root-edit-row">
                    <AsterismLogo class="root-item-icon size-3.5" />
                    <input
                        v-bind:ref="(el) => (editInputEl = el as HTMLInputElement | null)"
                        v-model="editTitle"
                        type="text"
                        class="root-edit-input"
                        v-bind:maxlength="ROOT_TITLE_MAX_LENGTH"
                        v-on:keydown.enter.prevent="confirmRename"
                        v-on:keydown.esc.prevent="cancelRename"
                        v-on:blur="onRenameBlur"
                    />
                </span>
                <button
                    type="button"
                    class="root-rename-btn"
                    v-bind:title="'重命名图谱'"
                    v-on:click.stop="startRename(info)"
                >
                    <PencilIcon class="size-3.5" />
                </button>
                <button
                    v-if="info.id !== currentRootId"
                    type="button"
                    class="root-delete-btn"
                    v-bind:class="{ armed: armedDeleteId === info.id }"
                    v-bind:title="armedDeleteId === info.id ? '再次点击确认删除（含全部子图）' : '删除图谱'"
                    v-on:click.stop="requestDeleteRoot(info)"
                >
                    <span v-if="armedDeleteId === info.id">确认</span>
                    <TrashIcon v-else class="size-3.5" />
                </button>
            </li>
        </ul>

        <p v-if="noticeText" class="panel-notice">{{ noticeText }}</p>

        <form class="create-row" v-on:submit.prevent="createAndSwitch">
            <input
                v-model="newRootTitle"
                type="text"
                class="text-input"
                placeholder="新根图谱名称…"
                v-bind:maxlength="ROOT_TITLE_MAX_LENGTH"
                v-on:input="noticeText = ''"
            />
            <button type="submit" class="create-btn" v-bind:disabled="!canCreate" v-bind:title="'创建并切换'">
                <PlusIcon class="size-4" />
            </button>
        </form>

        <div class="panel-divider"></div>

        <div class="placeholder-row">
            <button type="button" class="btn-secondary placeholder-btn" disabled v-bind:title="'笔记库 — 后续阶段'">
                <BookOpenIcon class="size-4" />
                <span>笔记库</span>
            </button>
            <button type="button" class="btn-secondary placeholder-btn" disabled v-bind:title="'常识层 — 后续阶段'">
                <GlobeAltIcon class="size-4" />
                <span>常识层</span>
            </button>
            <button type="button" class="btn-secondary placeholder-btn" disabled v-bind:title="'设置 — 后续阶段'">
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

/* 行内编辑：替换标题区的输入行（与 .root-item 同规格，行高一致） */
.root-edit-row {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    background: #f8fafc;
}

.root-edit-input {
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #334155;
    font-size: 13px;
}

/* 行操作按钮（更名 + 删除）：行悬浮显现，同规格（size-3.5 图标、flex 居中） */
.root-rename-btn,
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
    transition:
        opacity 0.15s,
        background 0.15s,
        color 0.15s;
}

.root-list li:hover .root-rename-btn,
.root-list li:hover .root-delete-btn,
.root-delete-btn.armed {
    opacity: 1;
}

.root-rename-btn:hover {
    background: #eff6ff;
    color: #3b82f6;
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

/* 轻量提示（空名 / 重名拦截等） */
.panel-notice {
    margin: 0;
    padding: 0 2px;
    font-size: 11px;
    color: #dc2626;
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
