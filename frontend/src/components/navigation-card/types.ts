/**
 * 功能：
 *     导航卡片子组件树共享的类型定义。
 *
 * 包含：
 *     - PanelKind — 面板开关状态
 *     - PathSegment — 面包屑路径段视图模型
 *     - SearchResult - 搜索面板的搜索结果
 *
 * 规则：
 *     1. 本文件只放 navigation-card/ 下多个组件共用的类型。
 *     2. 单组件内部使用的类型（如 SearchPanel 的 SearchResult）留在各自组件内。
 *     3. 不引用 graphStore 或任何运行时模块——纯类型定义。
 */

import type { GraphId } from '@my-project/graph-engine'

export type PanelKind = 'none' | 'navigation' | 'search'

export interface PathSegment {
    graphId: GraphId
    title: string
    isCurrent: boolean
}

/** 搜索结果视图模型。kind 用于左侧类型标识与右侧标签。 */
export interface SearchResult {
    id: string
    kind: 'node' | 'edge'
    label: string
}
