<template>
    <Transition name="slide-up">
        <div
            v-if="visible"
            class="notification-panel"
            v-bind:class="accentClass"
        >
            <button
                v-if="closable"
                type="button"
                class="notification-panel-close"
                v-on:click.stop="emit('close')"
            >
                ×
            </button>

            <div class="notification-panel-content">
                <slot />
            </div>

            <div
                v-if="$slots.actions"
                class="notification-panel-actions"
            >
                <slot name="actions" />
            </div>
        </div>
    </Transition>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

/**
 * 功能：
 *     可复用的底部居中通知面板。
 *
 * 总体结构：
 *     1. 通过 visible 控制显隐，外部使用 v-if 语义。
 *     2. 通过 accent 切换左侧强调色。
 *     3. 通过 closable 控制是否显示关闭按钮。
 *     4. 默认插槽承载主内容，actions 插槽承载操作按钮行。
 *
 * 外部如何使用：
 *     导入组件后，绑定 visible / accent / closable，监听 close 事件。
 */

// 输入：父组件传入 visible / accent / closable
interface NotificationPanelProps {
    visible: boolean
    accent?: 'red' | 'blue'
    closable?: boolean
}

// 设置：accent 默认红色，closable 默认不显示
const props = withDefaults(defineProps<NotificationPanelProps>(), {
    accent: 'red',
    closable: false,
})

// 输出：父组件监听 close 事件
const emit = defineEmits<{
    (event: 'close'): void
}>()

// 衍生：accent 值决定左侧边框色
const accentClass = computed(() => `accent-${props.accent}`)
</script>

<style scoped>
.notification-panel {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    max-width: 420px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(6px);
    border: 1px solid #e2e8f0;
    border-left-width: 4px;
    border-left-style: solid;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    z-index: 998;
}

.notification-panel.accent-red {
    border-left-color: #ef4444;
}

.notification-panel.accent-blue {
    border-left-color: #3b82f6;
}

.notification-panel-close {
    position: absolute;
    top: 4px;
    right: 6px;
    width: 20px;
    height: 20px;
    padding: 0;
    line-height: 1;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #dc2626;
    font-size: 18px;
    cursor: pointer;
    transition: background 0.15s;
}

.notification-panel-close:hover {
    background: rgba(220, 38, 38, 0.08);
}

.notification-panel-content {
    flex: 1 1 auto;
    min-width: 0;
}

.notification-panel-actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
    opacity: 0;
    transform: translate(-50%, 12px);
}
</style>
