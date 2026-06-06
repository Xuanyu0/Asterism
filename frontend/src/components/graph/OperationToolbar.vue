<template>
    <div class="operation-toolbar">
        <!-- 模式切换 -->
        <button
            :class="{ active: uiStore.interactionMode === 'cognition' }"
            @click="controller.enterCognitionMode"
        >
            Cognition
        </button>

        <button
            :class="{ active: uiStore.interactionMode === 'operation' }"
            @click="controller.enterOperationMode"
        >
            Operation
        </button>

        <!-- Operation 模式下的工具（仅 Operation 模式显示） -->
        <template v-if="uiStore.interactionMode === 'operation'">
            <button
                :class="{ active: uiStore.selectedOperationTool === 'add' }"
                @click="controller.selectOperationTool('add')"
            >
                Add
            </button>

            <!-- Add 展开：Node / Edge -->
            <template v-if="uiStore.selectedOperationTool === 'add'">
                <button
                    :class="{ active: uiStore.pendingAddTarget === 'node' }"
                    @click="controller.selectAddTarget('node')"
                >
                    Add Node
                </button>

                <button
                    :class="{ active: uiStore.pendingAddTarget === 'edge' }"
                    @click="controller.selectAddTarget('edge')"
                >
                    Add Edge
                </button>

                <!-- Add Node 展开：Real / Virtual -->
                <template v-if="uiStore.pendingAddTarget === 'node'">
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
                </template>

                <!-- Add Edge 展开：kind → direction -->
                <template v-if="uiStore.pendingAddTarget === 'edge'">
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

                    <template v-if="uiStore.pendingAddEdge.kind">
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
                    </template>
                </template>
            </template>

            <button
                :class="{ active: uiStore.selectedOperationTool === 'delete' }"
                @click="controller.selectOperationTool('delete')"
            >
                Delete
            </button>

            <!-- Delete 两步确认 -->
            <template v-if="uiStore.selectedOperationTool === 'delete' && (uiStore.pendingDeleteNodeId || uiStore.pendingDeleteEdgeId)">
                <div class="delete-confirm-hint">
                    点击相同目标再次确认，或：
                </div>
                <button
                    class="confirm-delete-btn"
                    @click="controller.confirmDelete()"
                >
                    确认删除
                </button>
                <button
                    class="cancel-delete-btn"
                    @click="controller.cancelDelete()"
                >
                    取消
                </button>
            </template>

            <button
                :class="{ active: uiStore.selectedOperationTool === 'fold' }"
                @click="controller.selectOperationTool('fold')"
            >
                Fold
            </button>

            <!-- 重置工具 -->
            <button
                v-if="uiStore.selectedOperationTool"
                class="reset-btn"
                @click="controller.resetOperationTool"
            >
                ✕
            </button>
        </template>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能：
 *     提供知识图谱操作工具栏组件。
 *
 * 总体结构：
 *     1. 模式切换（Cognition / Operation）
 *     2. Operation 模式工具：Add（→ Node/Edge → kind → direction）、Delete、Fold
 *     3. 所有操作通过 operation_controller 发出，不直接调 ui_store 写方法
 *     4. 工具栏只读取 uiStore 状态用于 active 显示
 *
 * 前端机制（Vue 3 框架行为）：
 *     - <script setup lang="ts">：
 *       Vue 3 编译期语法糖。顶层变量自动暴露给模板，import 的组件自动注册。
 *       C++ 类比：编译器自动生成声明，无需手动写 return / components。
 *
 *     - Pinia store 响应式：
 *       useOperationController() 返回的 uiStore 是 Pinia 响应式对象。
 *       模板中直接访问 uiStore.xxx 会自动建立依赖追踪。
 *       C++ 类比：Observer 模式，但框架自动管理订阅/取消订阅。
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 挂载本组件。
 */

import { useOperationController } from '@/ui/operation_controller'

const controller = useOperationController()
const uiStore = controller.uiStore
</script>

<style scoped>
.operation-toolbar {
    position: absolute;
    top: 20px;
    left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 999;
}

.operation-toolbar button {
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    background: white;
    border-radius: 6px;
    cursor: pointer;
}

.operation-toolbar button.active {
    background: #bfdbfe;
    border-color: #3b82f6;
}

.reset-btn {
    color: #ef4444;
    border-color: #fca5a5 !important;
}

.delete-confirm-hint {
    font-size: 12px;
    color: #ef4444;
    padding: 4px 6px;
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
