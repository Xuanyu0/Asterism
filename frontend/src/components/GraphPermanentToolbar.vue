<template>
    <!-- 常驻操作栏（顶部中央） -->
    <div
        class="permanent-toolbar absolute top-4 left-1/2 z-999 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/50 px-2 py-1 shadow-sm backdrop-blur-sm"
    >
        <template v-for="(btn, index) in permanentToolbar" v-bind:key="btn.id">
            <span
                v-if="isGroupStart(index)"
                class="h-6 w-0.5 bg-slate-100"
            ></span>
            <button
                class="cursor-pointer rounded-full border border-slate-300 bg-white px-2 py-2 text-xs whitespace-nowrap transition-all duration-150 hover:-translate-y-px hover:bg-blue-50 hover:shadow-sm data-active:border-blue-500 data-active:bg-blue-200"
                v-bind:data-active="activeToolId === btn.id ? '' : undefined"
                v-bind:title="btn.label"
                v-on:click="activateTool(btn)"
            >
                <component
                    v-bind:is="btn.icon"
                    class="pointer-events-none size-4"
                    v-bind:class="btn.iconClass"
                />
            </button>
        </template>
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
 *     按钮定义从 tools/toolbar/registry 读取。
 *     激活/取消通过 tools/tool_mediator 转发。
 */

import { computed, onMounted } from 'vue'

import { toolbarConfig } from '@/feature-tools/toolbar/config'
import { useToolMediator } from '@/feature-tools/mediator'

const mediator = useToolMediator()

const activeToolId = computed(() => mediator.activeToolId.value)

// 从注册表读取按钮定义
const permanentToolbar = toolbarConfig

// ── 注册所有处理器 ──

onMounted(() => {
    for (const config of toolbarConfig) {
        mediator.register(config.id, config.useTool())
    }
})

// ── 工具激活/取消 ──

function activateTool(btn: (typeof permanentToolbar)[number]): void {
    if (activeToolId.value === btn.id) {
        mediator.deactivate()
        return
    }

    mediator.activate(btn.id)
}

// ── 组边界判定（私有辅助）──

/**
 * 功能：
 *
 *     判断按钮是否为其分组的第一个元素（即组边界，渲染层需在其前插入分隔线）。
 *
 * 参数：
 *
 *     index — 按钮在 permanentToolbar 中的下标（由 v-for 传入）
 *
 * 注意：
 *
 *     仅在 index > 0 时才访问前驱元素，避免越界读取。
 */
function isGroupStart(index: number): boolean {
    if (index === 0) return false
    return permanentToolbar[index - 1]!.group !== permanentToolbar[index]!.group
}
</script>
