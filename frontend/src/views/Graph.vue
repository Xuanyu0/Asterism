<script lang="ts" setup>
/**
 * 功能：
 *     Graph 页面组合层。
 *
 * 总体结构：
 *     1. 挂载 Cytoscape 容器
 *     2. 初始化 Cytoscape Renderer
 *     3. 监听 GraphData 变化并同步渲染
 *     4. 绑定 Cytoscape 语义交互事件（tap / cxttap / dblclick / mouseover / mouseout）
 *     5. 双击节点导航（引用节点→源图、抽象节点→子图）
 *     6. 挂载 GraphNodeWindow、GraphPermanentToolbar 与 GraphModeSelector
 */

import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

import type { ComponentPublicInstance } from 'vue'
import type { NodeId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useLifecycle } from '@/graph/use-case/useLifecycle'
import { useGraphOperation } from '@/graph/use-case/useGraphOperation'

import { useRenderer } from '@/cytoscape/useRenderer.ts'
import { useCanvasFocus } from '@/composables/useCanvasFocus'
import { useToolMediator } from '@/feature-tools/mediator'
import { useDeconstructTool } from '@/feature-tools/cognition/deconstruct'

import GraphNodeWindow from '@/components/GraphFloatingWindow.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'
import GraphPermanentToolbar from '@/components/GraphPermanentToolbar.vue'
import GraphModeSelector from '@/components/GraphModeSelector.vue'
import GraphNavigationCard from '@/components/GraphNavigationCard.vue'

const cyContainer = ref<HTMLDivElement | null>(null)

const graphStore = useGraphStore()
const renderer = useRenderer(cyContainer)
const canvasFocus = useCanvasFocus()
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
 *
 *     临时快捷键接线（010 §3.2，非契约）：Ctrl+Z 撤销 / Ctrl+Shift+Z 或 Ctrl+Y 重做，
 *     供手动冒烟验证。命中组合时 preventDefault 拦截浏览器原生回退；
 *     不做焦点判断（试玩阶段全页面拦截），正式 UI 由步骤 04 承接。
 */
function handleUndoRedoKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
            graphStore.redo()
        } else {
            graphStore.undo()
        }
        return
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        graphStore.redo()
    }
}

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
        return (
            validation?.issues.filter((issue) => issue.severity === 'error') ??
            []
        )
    }
    return []
})

const activeNotification = computed(
    () => mediator.activeHandler.value?.notification ?? null,
)

// 错误通知面板根元素（组件 ref → $el 取根 DOM）
const errorPanelRef = ref<ComponentPublicInstance | null>(null)

/**
 * 功能：
 *     错误通知面板的外部交互关闭：点击面板外任意处清空校验结果。
 *
 * 规则：
 *     1. 点击目标在面板根元素内（含子孙）不清错——用户在面板内交互。
 *     2. 面板不可见时 $el 非 HTMLElement，点击任意处清错（置 null 无害）。
 */
function handleErrorPanelPointerdown(event: PointerEvent): void {
    const target = event.target
    const panelEl = errorPanelRef.value?.$el
    if (
        panelEl instanceof HTMLElement &&
        target instanceof Node &&
        panelEl.contains(target)
    ) {
        return
    }
    useGraphOperation().clearValidationResult()
}

onMounted(() => {
    // 临时快捷键接线（010 §3.2）：注册后随组件卸载移除
    window.addEventListener('keydown', handleUndoRedoKeydown)

    // 错误通知外部交互关闭：点击面板外任意处清错，随组件卸载移除
    window.addEventListener('pointerdown', handleErrorPanelPointerdown)

    // 时序编排：全量注册 → 恢复上次视图根图（无则兜底创建）→ 切换视图
    useLifecycle().registerAllGraphs()
    const rootId = useLifecycle().ensureWorkspaceRoot()
    graphStore.loadGraphToView(rootId)

    // default 已由 mediator 初始激活（createMediator 创建即 default），无需手动激活

    // 注册认知工具 handler（3.0-1：deconstruct 作为原型）
    mediator.register('deconstruct', useDeconstructTool())

    renderer.mount({
        onCanvasClicked(position) {
            mediator.onCanvasClick(position)
        },
        onNodeClicked(nodeId) {
            mediator.onNodeClick(nodeId)
        },
        onEdgeClicked(edgeId) {
            mediator.onEdgeClick(edgeId)
        },
        onRightClick() {
            mediator.onRightClick()
        },
        onNodeDoubleClicked(nodeId: NodeId) {
            // 步骤 A：工具激活检查 — 有非默认工具激活时不执行导航
            if (mediator.activeToolId.value !== 'default') return

            // 步骤 B：清理 + 导航（委托 mediator 转发至 default handler）
            mediator.deactivate()
            mediator.onNodeDoubleClick(nodeId)
        },
        onNodeHovered(nodeId: NodeId) {
            mediator.onNodeHover(nodeId)
        },
        onNodeHoverOut(nodeId: NodeId) {
            mediator.onNodeHoverOut(nodeId)
        },
    })

    if (graphStore.graphView) {
        renderer.syncFromGraphData(graphStore.graphView)
    }
})

/**
 * 功能：
 *     监听当前 GraphData 的变化，并同步 Cytoscape 渲染元素。
 *
 * 规则：
 *     1. Graph.vue 只负责组合 Runtime。
 *     2. Renderer 内部完成 GraphData → CyElements 映射。
 *     3. 本监听不负责修改 GraphData。
 *     4. 本监听不负责决定图谱视角策略。
 */
watch(
    () => graphStore.graphView,
    (newGraph) => {
        if (!newGraph) {
            return
        }

        renderer.syncFromGraphData(newGraph)
    },
)

// 删除目标高亮：通过 ToolHandler 接口的可选 highlightNode / highlightEdge 统一消费
renderer.bindHighlight(
    () => mediator.activeHandler.value?.highlightNode ?? null,
    'delete-target',
)
renderer.bindHighlight(
    () => mediator.activeHandler.value?.highlightEdge ?? null,
    'delete-target',
)

/**
 * 功能：
 *     消费画布定位请求：useCanvasFocus.pendingCanvasFocusId → renderer.centerOnElement。
 *
 * 规则：
 *     1. 消费后立即清除请求，保证同一元素可重复触发定位。
 *     2. 本监听不修改 GraphData。
 */
watch(
    () => canvasFocus.pendingCanvasFocusId.value,
    (targetId) => {
        if (!targetId) {
            return
        }

        renderer.centerOnElement(targetId)
        canvasFocus.clearCanvasFocus()
    },
)

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleUndoRedoKeydown)
    window.removeEventListener('pointerdown', handleErrorPanelPointerdown)
    renderer.destroy()
})
</script>

<template>
    <div
        class="relative h-screen w-screen bg-slate-50"
        v-on:contextmenu.prevent
    >
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
                常驻操作栏。

            规则：
                1. 负责修改 UI Runtime 的用户意图。
                2. 不直接修改 GraphData。
                3. 不直接操作 Cytoscape。
        -->
        <GraphPermanentToolbar />
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
            ref="errorPanelRef"
            v-bind:visible="canvasErrorIssues.length > 0"
            accent="red"
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
            <span v-if="activeNotification">{{
                activeNotification.message
            }}</span>
            <template #actions>
                <button
                    type="button"
                    class="btn-secondary delete-cancel-btn"
                    v-on:click.stop="activeNotification?.onCancel()"
                >
                    取消
                </button>
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
