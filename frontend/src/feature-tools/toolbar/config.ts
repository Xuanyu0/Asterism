/**
 * 功能：
 *
 *     工具栏按钮配置数组。定义按钮的显示信息和处理器工厂。
 *
 * 总体结构：
 *
 *     1. toolbarConfig — 按钮注册表数组（节点组 / 边组 / 工具组）
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
 *
 *     工具栏按钮注册表数组。
 *
 * 规则：
 *
 *     1. 按钮顺序决定工具栏显示顺序。
 *     2. group 字段标记视觉分组，渲染层在组边界自动插入分隔线。
 */
export const toolbarConfig: ToolConfig[] = [
    // ── 节点组 ──
    {
        id: 'add-real-node',
        group: 'node',
        icon: PlusCircleIcon,
        label: '添加实节点',
        useTool: () => useAddNodeTool('real'),
    },
    {
        id: 'add-virtual-node',
        group: 'node',
        icon: VirtualNodeIcon,
        label: '添加虚节点',
        useTool: () => useAddNodeTool('virtual'),
    },
    // ── 边组 ──
    {
        id: 'add-real-directed',
        group: 'edge',
        icon: ArrowRightIcon,
        label: '添加有向实边',
        useTool: () => useAddEdgeTool('real', 'directed'),
    },
    {
        id: 'add-real-undirected',
        group: 'edge',
        icon: MinusIcon,
        label: '添加无向实边',
        useTool: () => useAddEdgeTool('real', 'undirected'),
    },
    {
        id: 'add-virtual-directed',
        group: 'edge',
        icon: VirtualDirectedIcon,
        label: '添加有向虚边',
        useTool: () => useAddEdgeTool('virtual', 'directed'),
    },
    {
        id: 'add-virtual-undirected',
        group: 'edge',
        icon: VirtualUndirectedIcon,
        label: '添加无向虚边',
        useTool: () => useAddEdgeTool('virtual', 'undirected'),
    },
    // ── 工具组 ──
    {
        id: 'delete',
        group: 'otherTool',
        icon: TrashIcon,
        label: '删除',
        useTool: () => useDeleteTool(),
    },
    {
        id: 'fold',
        group: 'otherTool',
        icon: ChevronDownIcon,
        label: '折叠',
        useTool: () => useFoldTool(),
    },
    {
        id: 'move',
        group: 'otherTool',
        icon: ArrowsPointingOutIcon,
        label: '移动节点',
        useTool: () => useMoveNodeTool(),
    },
]
