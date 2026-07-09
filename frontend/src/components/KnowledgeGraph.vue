<template>
    <div class="relative h-screen w-screen bg-slate-50" v-on:contextmenu.prevent>
        <!--
            功能：
                Cytoscape 真正挂载的 DOM 容器。

            规则：
                1. ref="cyContainer" 会在 script 中得到这个 DOM。
                2. h-full / w-full 继承父容器尺寸。
                3. 本节点只给 Cytoscape 使用，不放业务逻辑。
        -->
        <div
            ref="cyContainer"
            class="h-full w-full"
            v-bind:class="containerClasses"
            v-on:contextmenu.prevent
        ></div>

        <!--
            功能：
                节点浮空窗。

            规则：
                1. DraftNode / 已有节点后续都通过这个组件展示。
                2. 不直接操作 Cytoscape。
        -->
        <NodeWindow />

        <!--
            功能：
                操作工具栏。

            规则：
                1. 负责修改 UI Runtime 的用户意图。
                2. 不直接修改 GraphData。
                3. 不直接操作 Cytoscape。
        -->
        <OperationToolbar />

        <!--
            功能：
                画布操作错误通知区。浮空窗关闭或打开时均显示错误，统一展示位置。
        -->
        <NotificationPanel
            :visible="canvasErrorIssues.length > 0"
            accent="red"
            closable
            v-on:close="graphStore.clearValidationResult()"
        >
            <p
                v-for="(issue, index) in canvasErrorIssues"
                v-bind:key="issue.code + '-' + index"
                class="canvas-error-text"
            >
                {{ issue.message }}
            </p>
        </NotificationPanel>
    </div>
</template>

<script lang="ts" setup>
/**
 * 功能：
 *     KnowledgeGraph 页面组合层。
 *
 * 总体结构：
 *     1. 挂载 Cytoscape 容器
 *     2. 初始化 Cytoscape Renderer
 *     3. 监听 GraphData 变化并同步渲染
 *     4. 绑定 Cytoscape 语义交互事件
 *     5. 挂载 NodeWindow 与 OperationToolbar
 *
 * 前端机制（Vue 3 框架行为）：
 *     - <script setup lang="ts">：
 *       Vue 3 编译期语法糖。顶层变量自动暴露给模板，import 的组件自动注册。
 *       C++ 类比：编译器自动生成声明，无需手动写 return / components。
 *
 *     - ref<HTMLDivElement | null>(null)：
 *       Vue 响应式引用。模板中的 ref="cyContainer" 自动将 DOM 元素赋值给 .value。
 *       C++ 类比：std::shared_ptr + Observer 通知，但框架自动管理注册/注销。
 *
 *     - onMounted / onBeforeUnmount：
 *       生命周期钩子。onMounted ≈ 构造函数（DOM 已挂载），
 *       onBeforeUnmount ≈ 析构函数（组件销毁前清理）。注意 onMounted 之前 ref 为空。
 *
 *     - watch(source, callback, { deep: true })：
 *       响应式观察者。source 中访问的响应式值变化时触发 callback。
 *       deep: true 递归监听嵌套属性。C++ 类比：Observer + 自动深比较 + 自动注册/注销。
 *
 * 外部如何使用：
 *     App.vue 直接挂载本组件。
 */

import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

import { useGraphStore } from '@/graph/graph_store'
import { mapGraphDataToCyElements } from '@/render/cytoscape/graph_element_mapper.ts'
import { useCytoscapeRenderer } from '@/render/cytoscape/use_cytoscape_renderer.ts'
import { useGraphInteraction } from '@/render/cytoscape/use_graph_interaction.ts'
import { useOperationController } from '@/ui/operation_controller'

import NodeWindow from './graph/NodeWindow.vue'
import NotificationPanel from './notification/NotificationPanel.vue'
import OperationToolbar from './graph/OperationToolbar.vue'

const cyContainer = ref<HTMLDivElement | null>(null)

const graphStore = useGraphStore()
const renderer = useCytoscapeRenderer(cyContainer)
const operationController = useOperationController()

/**
 * 功能：
 *
 *     根据当前激活工具决定画布光标样式。
 *
 * 规则：
 *
 *     常驻操作栏按钮激活工具时内部进入 Operation 模式。
 *     三种模式下工具均有效——光标样式不依赖 interactionMode。
 */
const containerClasses = computed(() => {
    const s = operationController.ui.state

    // 删除模式：pointer 光标 + 待定目标高亮
    if (s.selectedOperationTool === 'delete') {
        return { 'cursor-pointer': true }
    }

    // 折叠模式：pointer 光标
    if (s.selectedOperationTool === 'fold') {
        return { 'cursor-pointer': true }
    }

    // 添加节点：crosshair 光标
    if (s.selectedOperationTool === 'add' && s.pendingAddTarget === 'node' && s.pendingAddNode.kind !== null) {
        return { 'cursor-crosshair': true }
    }

    // 添加边：cell 光标
    if (s.selectedOperationTool === 'add' && s.pendingAddTarget === 'edge' && s.pendingAddEdge.kind !== null && s.pendingAddEdge.direction !== null && s.pendingAddEdge.sourceNodeId !== null) {
        return { 'cursor-cell': true }
    }

    // 解构操作：crosshair 光标，提示用户选择目标节点
    if (s.selectedCognitionAction === 'deconstruct') {
        return { 'cursor-deconstruct': true }
    }

    return {}
})

/**
 * 功能：
 *     读取画布级操作的 error 校验问题。
 *
 * 规则：
 *     1. 只显示 severity === 'error' 的 issues。
 *     2. 画布操作（Cognition / Arrangement）的错误在此显示。
 */
const canvasErrorIssues = computed(() => {
    const validation = graphStore.lastValidationResult
    if (!validation || !validation.valid) {
        return validation?.issues.filter(issue => issue.severity === 'error') ?? []
    }
    return []
})

onMounted(() => {
    graphStore.initRegistry()
    renderer.mount()

    if (graphStore.graphView) {
        renderer.syncElements(
            mapGraphDataToCyElements(graphStore.graphView),
        )
    }

    const cy = renderer.getInstance()

    if (cy) {
        useGraphInteraction(cy, {
            onCanvasClicked(position) {
                operationController.handleCanvasClicked(position)
            },

            onNodeClicked(nodeId) {
                operationController.handleNodeClicked({
                    nodeId,
                })
            },

            onEdgeClicked(edgeId) {
                operationController.handleEdgeClicked({
                    edgeId,
                })
            },

            onRightClick() {
                operationController.handleRightClick()
            },
        })
    }
})

/**
 * 功能：
 *     监听待定边起点节点 ID 变化，施加/清除高亮。
 */
watch(
    () => operationController.ui.state.pendingAddEdge.sourceNodeId,
    (nodeId, prevNodeId) => {
        const cy = renderer.getInstance()
        if (!cy) {
            return
        }

        if (prevNodeId) {
            const prevTarget = cy.getElementById(prevNodeId)
            if (prevTarget.length > 0) {
                prevTarget.removeClass('edge-source-target')
            }
        }

        if (nodeId) {
            const target = cy.getElementById(nodeId)
            if (target.length > 0) {
                target.addClass('edge-source-target')
            }
        }
    },
)

/**
 * 功能：
 *     监听当前 GraphData 的变化，并同步 Cytoscape 渲染元素。
 *
 * 规则：
 *     1. KnowledgeGraph.vue 只负责组合 Runtime。
 *     2. GraphData 必须先通过 graph_element_mapper.ts 投影为 CyElements。
 *     3. Renderer 只接收 CyElements，不直接接收 GraphData。
 *     4. 本监听不负责修改 GraphData。
 *     5. 本监听不负责决定图谱视角策略。
 */
watch(
    () => graphStore.graphView,
    (newGraph) => {
        if (!newGraph) {
            return
        }

        renderer.syncElements(
            mapGraphDataToCyElements(newGraph),
        )
    },
    {
        deep: true,
    },
)

/**
 * 功能：
 *     创建监听待定目标 ID 变化的 watcher，施加/清除 Cytoscape 高亮 class。
 *
 * 规则：
 *     1. 适用于 pendingDeleteNodeId / pendingDeleteEdgeId 等 ID 字段。
 *     2. getter 返回 ID 或 null，watcher 自动管理 class 增删。
 */
function watchPendingTarget(
    getter: () => string | null,
    className: string,
): void {
    watch(
        getter,
        (id, prevId) => {
            const cy = renderer.getInstance()
            if (!cy) return

            if (prevId) {
                const prev = cy.getElementById(prevId)
                if (prev.length > 0) prev.removeClass(className)
            }
            if (id) {
                const target = cy.getElementById(id)
                if (target.length > 0) target.addClass(className)
            }
        },
    )
}

watchPendingTarget(
    () => operationController.ui.state.pendingDeleteNodeId,
    'delete-target',
)

watchPendingTarget(
    () => operationController.ui.state.pendingDeleteEdgeId,
    'delete-target',
)

onBeforeUnmount(() => {
    renderer.destroy()
})
</script>

<style scoped>
.cursor-pointer {
    cursor: pointer;
}

.cursor-crosshair {
    cursor: crosshair;
}

.cursor-cell {
    cursor: cell;
}

.cursor-deconstruct {
    cursor: crosshair;
}

.canvas-error-text {
    color: #dc2626;
    margin: 0;
    text-align: center;
}

.canvas-error-text + .canvas-error-text {
    margin-top: 4px;
}
</style>
