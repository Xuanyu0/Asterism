<template>
    <div class="operation-toolbar">
        <!-- 主列：模式按钮 + 当前模式的一级操作 -->

        <div class="toolbar-column main-column">
            <button
                class="mode-btn"
                :class="{ active: showModeSelector }"
                @click="handleModeButtonClick"
            >
                {{ modeButtonLabel }}
            </button>

            <!-- C1: 模式选择列（替换操作区域） -->

            <template v-if="showModeSelector">
                <button
                    :class="{ active: uiStore.interactionMode === 'cognition' }"
                    @click="enterCognitionMode"
                >
                    Cognition
                </button>
                <button
                    :class="{ active: uiStore.interactionMode === 'operation' }"
                    @click="enterOperationMode"
                >
                    Operation
                </button>
                <button
                    :class="{ active: uiStore.interactionMode === 'arrangement' }"
                    @click="enterArrangementMode"
                >
                    Arrangement
                </button>
            </template>

            <!-- C7: Cognition 操作 -->

            <template v-else-if="uiStore.interactionMode === 'cognition'">
                <button @click="controller.explore()">
                    Explore
                </button>
                <button @click="controller.discover()">
                    Discover
                </button>
                <button @click="controller.deconstruct('')">
                    Deconstruct
                </button>
                <button @click="controller.induce([])">
                    Induce
                </button>
                <button @click="controller.internalize([])">
                    Internalize
                </button>
            </template>

            <!-- C8: Arrangement 占位 -->

            <div v-else-if="uiStore.interactionMode === 'arrangement'">
                <span class="placeholder-text">Arrangement — Phase 2</span>
            </div>

            <!-- C2: Operation 一级操作 -->

            <template v-else-if="uiStore.interactionMode === 'operation'">
                <button
                    :class="{ active: uiStore.selectedOperationTool === 'add' }"
                    @click="controller.selectOperationTool('add')"
                >
                    Add
                </button>
                <button
                    :class="{ active: uiStore.selectedOperationTool === 'delete' }"
                    @click="controller.selectOperationTool('delete')"
                >
                    Delete
                </button>
                <button
                    :class="{ active: uiStore.selectedOperationTool === 'fold' }"
                    @click="controller.selectOperationTool('fold')"
                >
                    Fold
                </button>

                <!-- C9: Delete 两步确认面板 -->

                <template v-if="uiStore.selectedOperationTool === 'delete' && (uiStore.pendingDeleteNodeId || uiStore.pendingDeleteEdgeId)">
                    <span class="delete-confirm-hint">再次点击确认删除，或：</span>
                    <button
                        class="confirm-delete-btn"
                        @click="controller.confirmDelete()"
                    >
                        确认
                    </button>
                    <button
                        class="cancel-delete-btn"
                        @click="controller.cancelDelete()"
                    >
                        取消
                    </button>
                </template>
            </template>
        </div>

        <!-- C3: Add 目标列 -->

        <div v-if="!showModeSelector && uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'add'" class="toolbar-column">
            <button
                :class="{ active: uiStore.pendingAddTarget === 'node' }"
                @click="controller.selectAddTarget('node')"
            >
                Node
            </button>
            <button
                :class="{ active: uiStore.pendingAddTarget === 'edge' }"
                @click="controller.selectAddTarget('edge')"
            >
                Edge
            </button>
        </div>

        <!-- C4: Node 类型列 -->

        <div v-if="!showModeSelector && uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'add' && uiStore.pendingAddTarget === 'node'" class="toolbar-column">
            <button
                :class="{ active: uiStore.pendingAddNode.kind === 'real' }"
                @click="controller.selectAddNodeKind('real')"
            >
                Real
            </button>
            <button
                :class="{ active: uiStore.pendingAddNode.kind === 'virtual' }"
                @click="controller.selectAddNodeKind('virtual')"
            >
                Virtual
            </button>
        </div>

        <!-- C5: Edge 类型列 -->

        <div v-if="!showModeSelector && uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'add' && uiStore.pendingAddTarget === 'edge'" class="toolbar-column">
            <button
                :class="{ active: uiStore.pendingAddEdge.kind === 'real' }"
                @click="controller.selectAddEdgeKind('real')"
            >
                Real Edge
            </button>
            <button
                :class="{ active: uiStore.pendingAddEdge.kind === 'virtual' }"
                @click="controller.selectAddEdgeKind('virtual')"
            >
                Virtual Edge
            </button>
        </div>

        <!-- C6: Edge 方向列 -->

        <div v-if="!showModeSelector && uiStore.interactionMode === 'operation' && uiStore.selectedOperationTool === 'add' && uiStore.pendingAddTarget === 'edge' && uiStore.pendingAddEdge.kind" class="toolbar-column">
            <button
                :class="{ active: uiStore.pendingAddEdge.direction === 'directed' }"
                @click="controller.selectAddEdgeDirection('directed')"
            >
                Directed
            </button>
            <button
                :class="{ active: uiStore.pendingAddEdge.direction === 'undirected' }"
                @click="controller.selectAddEdgeDirection('undirected')"
            >
                Undirected
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能：
 *     提供知识图谱操作工具栏组件——逐层右延列式布局。
 *
 * 总体结构：
 *     1. 主列：模式按钮 [>] + 当前模式的一级操作（同一列内垂直排列）
 *     2. 子列：有子级的操作向右延展新列（C3–C6）
 *     3. [>] 与操作按钮之间约 3 倍操作按钮间距
 *
 * 前端机制（Vue 3 框架行为）：
 *     - computed：Vue 响应式计算属性。依赖的值变化时自动重新计算，且有缓存。
 *       C++ 类比：缓存的 getter，依赖追踪自动失效。
 *
 *     - watch：响应式观察者。interactionMode 变化时自动关闭模式选择列。
 *       C++ 类比：Observer + 自动依赖追踪 + 自动注册/注销。
 *
 *     - Pinia store 响应式：模板中直接访问 uiStore.xxx 自动建立依赖追踪。
 *       C++ 类比：Observer 模式，但框架自动管理订阅/取消订阅。
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 挂载本组件。
 */

import { ref, computed, watch } from 'vue'
import { useOperationController } from '@/ui/operation_controller'

const controller = useOperationController()
const uiStore = controller.ui.state

const showModeSelector = ref(false)

const modeButtonLabel = computed(() => {
    switch (uiStore.interactionMode) {
        case 'operation': return 'O'
        case 'cognition': return 'C'
        case 'arrangement': return 'A'
        default: return '>'
    }
})

watch(() => uiStore.interactionMode, () => {
    showModeSelector.value = false
})

function handleModeButtonClick(): void {
    showModeSelector.value = !showModeSelector.value
}

function enterOperationMode(): void {
    controller.enterOperationMode()
}

function enterCognitionMode(): void {
    controller.enterCognitionMode()
}

function enterArrangementMode(): void {
    controller.enterArrangementMode()
}
</script>

<style scoped>
.operation-toolbar {
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

/* --- 模式按钮：圆形，稍小 --- */

.mode-btn {
    font-weight: bold;
    font-size: 14px !important;
    width: 28px;
    height: 28px;
    padding: 0 !important;
    border-radius: 50% !important;
    text-align: center !important;
    line-height: 26px;
}

/* --- 模式按钮与操作按钮之间 3 倍间距 --- */

.main-column .mode-btn + * {
    margin-top: 8px;
}

/* --- 杂项 --- */


.placeholder-text {
    font-size: 12px;
    color: #94a3b8;
    padding: 4px 8px;
    white-space: nowrap;
}

.delete-confirm-hint {
    font-size: 12px;
    color: #ef4444;
    padding: 4px 6px;
    white-space: nowrap;
}

.confirm-delete-btn {
    background: #ef4444 !important;
    color: white !important;
    border-color: #dc2626 !important;
}

.cancel-delete-btn {
    color: #6b7280;
}
</style>
