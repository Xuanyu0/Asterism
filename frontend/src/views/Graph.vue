<script lang="ts" setup>
/**
 * 功能：
 *     Graph 页面组合层。
 *
 * 总体结构：
 *     1. 挂载 Cytoscape 容器
 *     2. 初始化 Cytoscape Renderer
 *     3. 监听 GraphData 变化并同步渲染
 *     4. 绑定 Cytoscape 语义交互事件（tap / cxttap / dblclick）
 *     5. 双击节点导航子图（引用节点→源图、抽象节点→子图、子图节点→父图）
 *     6. 挂载 GraphNodeWindow、GraphOperationToolbar 与 GraphModeSelector
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
import type { NodeId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'

import { mapGraphDataToCyElements } from '@/render/graph_element_mapper.ts'
import { useCytoscapeRenderer } from '@/render/use_cytoscape_renderer.ts'
import { useGraphInteraction } from '@/render/use_graph_interaction.ts'
import { useUIStore } from '@/ui/ui_store'
import { useToolMediator } from '@/feature-tools/mediator'
import { useDefaultTool } from '@/feature-tools/default'
import { useDeconstructTool } from '@/feature-tools/cognition/deconstruct'

import GraphNodeWindow from '@/components/GraphNodeWindow.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'
import GraphOperationToolbar from '@/components/GraphOperationToolbar.vue'
import GraphModeSelector from '@/components/GraphModeSelector.vue'
import GraphNavigationCard from '@/components/GraphNavigationCard.vue'

const cyContainer = ref<HTMLDivElement | null>(null)

const graphStore = useGraphStore()
const renderer = useCytoscapeRenderer(cyContainer)
const uiStore = useUIStore()
const mediator = useToolMediator()

/**
 * 功能：
 *
 *     根据当前激活工具决定画布光标样式。
 *
 * 规则：
 *
 *     所有工具光标由 mediator.activeHandler 的 cursorClass 统一提供。
 */
const containerClasses = computed(() => {
    const toolCursor = mediator.activeHandler.value?.cursorClass
    if (toolCursor) {
        return { [toolCursor]: true }
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

const activeNotification = computed(() => mediator.activeHandler.value?.notification ?? null)

onMounted(() => {
    // 加载上次激活的根图谱
    graphStore.initRegistry()
    // 哨兵模式：确定要加载的根图 ID
    let rootId = (graphStore.graphRegistry.size > 0)
        ? graphStore.graphRegistry.keys().next().value : null
    // 尝试加载已存在的根图
    if (rootId && !graphStore.loadGraphToView(rootId)) {
        // 持久化数据损坏或丢失：降级为创建新根图
        rootId = null
    }
    // 无可用根图时创建默认根图
    if (!rootId) {
        rootId = graphStore.createRootGraph('My Graph')
        graphStore.loadGraphToView(rootId)
    }

    // 注册 default 工具——启动时激活为 baseline
    mediator.register('default', useDefaultTool())
    mediator.activate('default')

    // 注册认知工具 handler（3.0-1：deconstruct 作为原型）
    mediator.register('deconstruct', useDeconstructTool())

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
                mediator.onCanvasClick(position)
            },

            onNodeClicked(nodeId) {
                // 统一走 mediator——活跃 handler 或 default 工具 fallback 自动处理
                mediator.onNodeClick(nodeId)
            },

            onEdgeClicked(edgeId) {
                // 统一走 mediator——活跃 handler 或 default 工具 fallback 自动处理
                mediator.onEdgeClick(edgeId)
            },

            onRightClick() {
                mediator.onRightClick()
            },

            onNodeDoubleClicked(nodeId: NodeId) {
                // 步骤 A：工具激活检查 — 有非默认工具激活时不执行导航
                const activeToolId = mediator.activeToolId.value
                if (activeToolId !== null && activeToolId !== 'default') {
                    return
                }

                // 防御：graphView 为 null 时无图可操作
                if (!graphStore.graphView) {
                    return
                }

                // 步骤 B：查找节点数据
                const node = graphStore.graphView.nodes.find(n => n.id === nodeId)
                if (!node) {
                    return
                }

                // 步骤 C：按优先级决定导航目标
                let targetGraphId: string | undefined
                let focusNodeId: string | undefined

                // 优先级 1：引用节点 → 跳转到源节点所在图
                // discriminated union：node.role === 'reference' 后 node 自动窄化为 ReferenceNodeData
                if (node.role === 'reference' && node.sourceGraphId) {
                    targetGraphId = node.sourceGraphId
                    focusNodeId = node.sourceNodeId
                }
                // 优先级 2：抽象节点 → 跳转子图
                else if (node.childGraphId) {
                    targetGraphId = node.childGraphId
                }
                // 优先级 3：子图中的普通节点 → 跳转父图
                else if (graphStore.graphView.parentGraphId) {
                    targetGraphId = graphStore.graphView.parentGraphId
                }
                // 优先级 4：根图中的普通节点 → 空操作
                else {
                    return
                }

                // 步骤 D：清理 + 导航
                uiStore.closeFloatingWindow()
                mediator.deactivate()

                // loadGraphToView 可能失败（目标图丢失等），
                // 失败后 graphView 保持在旧图，不执行后续 focus
                if (!graphStore.loadGraphToView(targetGraphId)) {
                    return
                }

                // 步骤 E：引用节点追加定位
                if (focusNodeId) {
                    uiStore.requestCanvasFocus(focusNodeId)
                }
            },
        })
    }
})

/**
 * 功能：
 *     监听 add-edge handler 的起点高亮，施加/清除 .edge-source-target。
 *
 * 规则：
 *     1. 仅边添加工具生效——其他 handler 不设起点节点。
 */
watch(
    () => {
        const handler = mediator.activeHandler.value
        if (!handler) return null
        const id = handler.id as string
        if (!id.includes('directed') && !id.includes('undirected')) return null
        return handler.highlightNode ?? null
    },
    (id, prevId) => {
        const cy = renderer.getInstance()
        if (!cy) return

        if (prevId) {
            const prev = cy.getElementById(prevId)
            if (prev.length > 0) prev.removeClass('edge-source-target')
        }
        if (id) {
            const target = cy.getElementById(id)
            if (target.length > 0) target.addClass('edge-source-target')
        }
    },
)

/**
 * 功能：
 *     监听当前 GraphData 的变化，并同步 Cytoscape 渲染元素。
 *
 * 规则：
 *     1. Graph.vue 只负责组合 Runtime。
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
 *     1. 适用于 operationRuntime.pendingDeleteNodeId / pendingDeleteEdgeId 等 ID 字段。
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

// 删除目标高亮：通过 ToolHandler 接口的可选 highlightNode / highlightEdge 统一消费
watchPendingTarget(
    () => mediator.activeHandler.value?.highlightNode ?? null,
    'delete-target',
)
watchPendingTarget(
    () => mediator.activeHandler.value?.highlightEdge ?? null,
    'delete-target',
)

// watchPendingTarget 保留供未来 cognition/arrangement 高亮使用

/**
 * 功能：
 *     消费画布定位请求：ui_store.pendingCanvasFocusId → renderer.revealElement。
 *
 * 规则：
 *     1. 消费后立即清除请求，保证同一元素可重复触发定位。
 *     2. 本监听不修改 GraphData。
 */
watch(
    () => uiStore.pendingCanvasFocusId,
    (targetId) => {
        if (!targetId) {
            return
        }

        renderer.revealElement(targetId)
        uiStore.clearCanvasFocus()
    },
)

onBeforeUnmount(() => {
    renderer.destroy()
})
</script>

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
        <GraphNodeWindow />

        <!--
            功能：
                操作工具栏。

            规则：
                1. 负责修改 UI Runtime 的用户意图。
                2. 不直接修改 GraphData。
                3. 不直接操作 Cytoscape。
        -->
        <GraphOperationToolbar />
        <GraphModeSelector />

        <!--
            功能：
                导航卡片。显示当前图谱位置（根图名称 + 子图路径），
                提供根图谱切换 / 新建 / 逐级返回入口。

            规则：
                1. 独立于操作栏与交互模式 UI，只读 graphStore 状态。
                2. 图谱切换经 graphStore.loadGraphToView 唯一入口。
                3. 不直接操作 Cytoscape。
        -->
        <GraphNavigationCard />

        <!--
            功能：
                画布操作错误通知区。浮空窗关闭或打开时均显示错误，统一展示位置。
        -->
        <NotificationPanel
            v-bind:visible="canvasErrorIssues.length > 0"
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

        <!--
            功能：
                工具通知面板。由活跃 handler 的 notification 字段驱动，
                渲染 handler 自包含的完整消息文本。
        -->
        <NotificationPanel
            v-bind:visible="activeNotification?.visible ?? false"
            accent="red"
        >
            <span v-if="activeNotification">{{ activeNotification.message }}</span>
            <template #actions>
                <button
                    type="button"
                    class="btn-secondary delete-cancel-btn"
                    v-on:click.stop="activeNotification?.onCancel()"
                >取消</button>
            </template>
        </NotificationPanel>
    </div>
</template>

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

.delete-cancel-btn {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
}
</style>
