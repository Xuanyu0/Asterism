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
 *     4. 当前 frontend 已实现 localStorageAdapter 但 graph_store.ts 尚未接入——
 *        后者仍直接调用 saveGraph() / loadG raph() 等同步函数。
 *        等需要换存储（IndexedDB / Supabase）时再做同步→异步迁移，
 *        届时 graph_store.ts 改用 localStorageAdapter 接口即可。
 *
 */

import type { GraphData, GraphId } from '../types/graph_data'

export interface PersistenceAdapter {
    load(graphId: GraphId): Promise<GraphData | null>
    save(graph: GraphData): Promise<void>
    delete(graphId: GraphId): Promise<void>
    list(): Promise<GraphData[]>
}
