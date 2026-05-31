/**
 * 功能：
 *     管理尚未提交到 GraphData 的图对象草稿。
 *
 * 总体结构：
 *     1. DraftNode Runtime
 *     2. DraftEdge Runtime
 *     3. Draft Runtime Action
 *
 * 外部如何使用：
 *     ui_store.ts 与组件层通过本 Store 创建或销毁草稿。
 *     graph_store.ts 不直接保存 Draft。
 *
 * NOTE:
 *     Draft Runtime 位于 UI Runtime 与 Graph Runtime 之间。
 *     Draft 永远不允许直接进入 GraphData。
 */

import { defineStore } from 'pinia'
import type { DraftEdge, DraftNode } from '@/definitions/types/draft_types'
import type { NodeKind } from '@/definitions/types/graph_types'

/**
 * 功能：
 *     Draft Runtime 当前状态。
 *
 * 规则：
 *     1. 同时最多存在一个 DraftNode。
 *     2. 同时最多存在一个 DraftEdge。
 *     3. DraftNode 与 DraftEdge 互斥。
 */
export interface DraftStoreState {
    draftNode: DraftNode | null
    draftEdge: DraftEdge | null
}

export const useDraftStore = defineStore('draft_store', {
    state: (): DraftStoreState => ({
        draftNode: null,
        draftEdge: null,
    }),

    actions: {

        /**
         * 功能：
         *     创建新的节点草稿。
         *
         * 规则：
         *     1. 自动清除当前 DraftEdge。
         *     2. 新草稿拥有默认空文本。
         *     3. 不直接进入 GraphData。
         *
         * NOTE:
         *     Add Node 流程应优先调用本接口，
         *     而不是直接构造 DraftNode。
         */
        createDraftNode(
            kind: NodeKind,
            x: number,
            y: number
        ): void {
            this.draftEdge = null

            this.draftNode = {
                kind,
                x,
                y,
                label: '',
                summary: '',
            }
        },


        /**
         * 功能：
         *     设置当前节点草稿。
         *
         * 规则：
         *     1. 设置 DraftNode 时自动清除 DraftEdge。
         *     2. DraftNode 不会直接进入 GraphData。
         *
         * NOTE:
         *     DraftNode 是用户意图的临时表达。
         *     只有 Commit 后才允许转换为 GraphOperation。
         */
        setDraftNode(
            draftNode: DraftNode
        ): void {
            this.draftEdge = null
            this.draftNode = draftNode
        },


        /**
         * 功能：
         *     更新当前节点草稿。
         *
         * 规则：
         *     1. 当前必须存在 DraftNode。
         *     2. 只更新传入字段。
         *     3. 不会直接修改 GraphData。
         *
         * NOTE:
         *     浮空窗编辑节点信息时，
         *     应通过本接口修改 DraftNode。
         */
        updateDraftNode(
            patch: Partial<DraftNode>
        ): void {
            if (!this.draftNode) {
                return
            }

            this.draftNode = {
                ...this.draftNode,
                ...patch,
            }
        },

        /**
         * 功能：
         *     删除当前节点草稿。
         *
         * 规则：
         *     1. 不影响 GraphData。
         *     2. 不影响 UI Mode。
         */
        clearDraftNode(): void {
            this.draftNode = null
        },

        /**
         * 功能：
         *     清空所有草稿状态。
         *
         * 规则：
         *     1. 不影响 GraphData。
         *     2. 不影响 UI Runtime 状态。
         *     3. 通常用于取消当前草稿流程。
         */
        clearAllDrafts(): void {
            this.draftNode = null
            this.draftEdge = null
        },
    },
})
