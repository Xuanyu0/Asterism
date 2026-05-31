<template>
    <div
        v-if="draftNode"
        class="draft-window"
    >
        <h3>Draft Node</h3>

        <input
            :value="draftNode.label"
            placeholder="Label"
            @input="handleLabelInput"
        />

        <textarea
            :value="draftNode.summary"
            placeholder="Summary"
            @input="handleSummaryInput"
        />

        <div class="button-row">
            <button
                @click="operationController.confirmDraftNode"
            >
                Confirm
            </button>

            <button
                @click="operationController.cancelDraftNode"
            >
                Cancel
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能：
 *     提供节点浮空窗组件。
 *
 * 总体结构：
 *     1. DraftNode 编辑入口
 *     2. 后续已存在节点编辑入口
 *
 * 外部如何使用：
 *     KnowledgeGraph.vue 挂载本组件。
 */

import { computed } from 'vue'
import { useDraftStore } from '@/ui/draft_store'
import { useOperationController } from '@/ui/operation_controller'

const draftStore = useDraftStore()
const operationController = useOperationController()

const draftNode = computed(() => draftStore.draftNode)

function handleLabelInput(
    event: Event,
): void {
    const target = event.target as HTMLInputElement

    operationController.updateDraftNode({
        label: target.value,
    })
}

function handleSummaryInput(
    event: Event,
): void {
    const target = event.target as HTMLTextAreaElement

    operationController.updateDraftNode({
        summary: target.value,
    })
}
</script>

<style scoped>
.draft-window {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 300px;
    padding: 12px;
    background: white;
    border: 1px solid #ccc;
    z-index: 999;
}

.draft-window input,
.draft-window textarea {
    width: 100%;
    margin-bottom: 8px;
}

.button-row {
    display: flex;
    gap: 8px;
}
</style>
