<template>
    <!-- 常驻操作栏（顶部中央） -->
    <div class="standing-toolbar">
        <button
            v-for="btn in standingButtons"
            v-bind:key="btn.tool"
            v-bind:class="{ active: activeToolId === btn.tool }"
            v-bind:title="btn.label"
            v-on:click="activateTool(btn)"
        >
            <component v-bind:is="btn.icon" class="size-4 pointer-events-none" v-bind:class="btn.iconClass" />
        </button>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能：
 *
 *     图谱常驻操作栏（顶部中央 8 按钮）。
 *
 * 总体结构：
 *
 *     8 个按钮：实节点、虚节点、有向实边、无向实边、有向虚边、无向虚边、删除、折叠
 *
 * 前端机制（Vue 3 框架行为）：
 *     - computed：Vue 响应式计算属性。依赖的值变化时自动重新计算，且有缓存。
 *       C++ 类比：缓存的 getter，依赖追踪自动失效。
 *
 * 外部如何使用：
 *
 *     Graph.vue 挂载本组件。
 */

import { computed, type Component } from 'vue'
import {
    PlusCircleIcon,
    ArrowRightIcon,
    MinusIcon,
    TrashIcon,
    ChevronDownIcon,
} from '@heroicons/vue/24/outline'

import VirtualNodeIcon from '@/assets/icon-virtual-node.svg?component'
import VirtualDirectedIcon from '@/assets/icon-virtual-directed.svg?component'
import VirtualUndirectedIcon from '@/assets/icon-virtual-undirected.svg?component'

import type { OperationTool } from '@/definitions/types/ui_types'
import { useOperationController } from '@/ui/operation_controller'

const controller = useOperationController()

/**
 * 功能：
 *
 *     selectedOperationTool 的恒等投影——直接透传原子工具 ID。
 */
const activeToolId = computed<OperationTool | null>(() => controller.ui.state.selectedOperationTool)

// 常驻操作栏按钮定义
const standingButtons: Array<{
    tool: OperationTool
    icon: Component
    iconClass?: string
    label: string
}> = [
    // 节点组
    { tool: 'add-real-node' as const, icon: PlusCircleIcon, label: '添加实节点' },
    { tool: 'add-virtual-node' as const, icon: VirtualNodeIcon, label: '添加虚节点' },
    // 边组
    { tool: 'add-real-directed' as const, icon: ArrowRightIcon, label: '添加有向实边' },
    { tool: 'add-real-undirected' as const, icon: MinusIcon, label: '添加无向实边' },
    { tool: 'add-virtual-directed' as const, icon: VirtualDirectedIcon, label: '添加有向虚边' },
    { tool: 'add-virtual-undirected' as const, icon: VirtualUndirectedIcon, label: '添加无向虚边' },
    // 工具组
    { tool: 'delete' as const, icon: TrashIcon, label: '删除' },
    { tool: 'fold' as const, icon: ChevronDownIcon, label: '折叠' },
]


function activateTool(btn: (typeof standingButtons)[number]): void {
    // Toggle：若当前按钮已激活，重置为无选中状态。
    if (activeToolId.value === btn.tool) {
        controller.resetOperationTool()
        return
    }

    // 原子工具选择——tool ID 编码完整路径
    controller.selectOperationTool(btn.tool)
}
</script>

<style scoped>
/* ── 常驻操作栏（顶部中央）── */

.standing-toolbar {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(6px);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 999;
}

.standing-toolbar button {
    padding: 3px 8px;
    border: 1px solid #cbd5e1;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
}

.standing-toolbar button:hover {
    background: #f1f5f9;
    transform: translateY(-1px);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.standing-toolbar button.active {
    background: #bfdbfe;
    border-color: #3b82f6;
}

/* 组间间距（第3个=边组起点，第7个=工具组起点） */
.standing-toolbar > button:nth-child(3),
.standing-toolbar > button:nth-child(7) {
    margin-left: 8px;
}

</style>
