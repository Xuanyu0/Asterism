/**
 * 功能：
 *     工具栏按钮配置数组。定义按钮的显示信息和处理器工厂。
 *
 * 外部如何使用：
 *     GraphPermanentToolbar.vue 读取本数组渲染按钮。
 *     Graph.vue 遍历本数组调用 useTool() 注册处理器。
 */

import {
    PlusCircleIcon,
    ArrowRightIcon,
    MinusIcon,
    TrashIcon,
    ChevronDownIcon,
    ArrowsPointingOutIcon,
} from '@heroicons/vue/24/outline'

import VirtualNodeIcon from '@/assets/icon-virtual-node.svg?component'
import VirtualDirectedIcon from '@/assets/icon-virtual-directed.svg?component'
import VirtualUndirectedIcon from '@/assets/icon-virtual-undirected.svg?component'

import { useAddNodeTool } from './add_node'
import { useAddEdgeTool } from './add_edge'
import { useDeleteTool } from './delete'
import { useFoldTool } from './fold'
import { useMoveNodeTool } from './move_node'

import type { ToolConfig } from '../types'


/**
 * 功能：
 *     工具栏按钮注册表数组。
 *
 * 规则：
 *     1. 按钮顺序决定工具栏显示顺序。
 *     2. 第 3 个和第 7 个按钮在 CSS 中有左边距（分组视觉分隔）。
 */
export const toolbarConfig: ToolConfig[] = [
    // ── 节点组 ──
    { id: 'add-real-node',         icon: PlusCircleIcon,              label: '添加实节点',   useTool: () => useAddNodeTool('real') },
    { id: 'add-virtual-node',      icon: VirtualNodeIcon,             label: '添加虚节点',   useTool: () => useAddNodeTool('virtual') },
    // ── 边组 ──
    { id: 'add-real-directed',     icon: ArrowRightIcon,              label: '添加有向实边', useTool: () => useAddEdgeTool('real', 'directed') },
    { id: 'add-real-undirected',   icon: MinusIcon,                   label: '添加无向实边', useTool: () => useAddEdgeTool('real', 'undirected') },
    { id: 'add-virtual-directed',  icon: VirtualDirectedIcon,         label: '添加有向虚边', useTool: () => useAddEdgeTool('virtual', 'directed') },
    { id: 'add-virtual-undirected', icon: VirtualUndirectedIcon,      label: '添加无向虚边', useTool: () => useAddEdgeTool('virtual', 'undirected') },
    // ── 工具组 ──
    { id: 'delete',                icon: TrashIcon,                   label: '删除',         useTool: () => useDeleteTool() },
    { id: 'fold',                  icon: ChevronDownIcon,             label: '折叠',         useTool: () => useFoldTool() },
    { id: 'move',                  icon: ArrowsPointingOutIcon,      label: '移动节点',     useTool: () => useMoveNodeTool() },
]
