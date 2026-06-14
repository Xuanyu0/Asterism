/**
 * persistence.ts
 *
 * 功能：
 *     定义图数据持久化适配器的接口契约。引擎不拥有实现——消费者（前端 localStorage、后端 Supabase）
 *     各自注入实现。
 *
 * 总体结构：
 *     1. PersistenceAdapter — 图数据 CRUD 接口
 *
 * 规则：
 *     1. 接口只定义契约，不含实现。
 *     2. 引擎核心不调用此接口——由 Pinia store 在保存 / 加载时调用。
 *     3. load / save / delete / list 均为异步操作，支持未来切换到网络存储。
 *
 * 外部如何使用：
 *     import type { PersistenceAdapter } from '@my-project/graph-engine'
 *
 *     前端实现：
 *         const localStorageAdapter: PersistenceAdapter = {
 *             load: async (id) => { ... localStorage.getItem(...) ... },
 *             save: async (graph) => { ... localStorage.setItem(...) ... },
 *             delete: async (id) => { ... localStorage.removeItem(...) ... },
 *             list: async () => { ... Object.keys(localStorage).filter(...) ... },
 *         }
 */

import type { GraphData, GraphId } from '../types/graph_data'

export interface PersistenceAdapter {
    load(graphId: GraphId): Promise<GraphData | null>
    save(graph: GraphData): Promise<void>
    delete(graphId: GraphId): Promise<void>
    list(): Promise<GraphData[]>
}
