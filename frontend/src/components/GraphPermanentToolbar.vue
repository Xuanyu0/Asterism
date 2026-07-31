<template>
    <!-- 常驻操作栏（顶部中央） -->
    <div class="permanent-toolbar">
        <button
            v-for="btn in permanentToolbar"
            v-bind:key="btn.id"
            v-bind:class="{ active: activeToolId === btn.id }"
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
</script>

<style scoped>
/* ── 常驻操作栏（顶部中央）── */

.permanent-toolbar {
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

.permanent-toolbar button {
    padding: 3px 8px;
    border: 1px solid #cbd5e1;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
}

.permanent-toolbar button:hover {
    background: #f1f5f9;
    transform: translateY(-1px);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.permanent-toolbar button.active {
    background: #bfdbfe;
    border-color: #3b82f6;
}

/* 组间间距 */
.permanent-toolbar > button:nth-child(3),
.permanent-toolbar > button:nth-child(7) {
    margin-left: 8px;
}

</style>
