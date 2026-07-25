/**
 * 功能：
 *     提供 Cytoscape 渲染样式配置。
 *
 * 总体结构：
 *     1. createCytoscapeStyle()
 *
 * 外部如何使用：
 *     useRenderer.ts 调用本文件获取 Cytoscape 样式。
 *
 */


import { DEFAULT_NODE_RULES } from '@my-project/graph-engine'


/**
 * 功能：
 *     创建 Cytoscape 样式配置。
 *
 * 规则：
 *     1. 只负责视觉样式。
 *     2. 不读取 GraphData。
 *     3. 不操作 Cytoscape 实例。
 */
export function createCytoscapeStyle() {
    return [
        // 节点基础
        {
            selector: 'node',
            style: {
                'width': DEFAULT_NODE_RULES.nodeDiameter,
                'height': DEFAULT_NODE_RULES.nodeDiameter,
                'font-size': `${DEFAULT_NODE_RULES.fontSize}px`,
                'background-color': `#f0f0f0`,
                'border-color': '#3d3d3d',
                'border-width': 2,
                label: 'data(label)',
            },
        },
        {
            selector: 'node.node-real',
            style: {
                'border-style': 'solid',
            },
        },
        {
            selector: 'node.node-virtual',
            style: {
                'border-style': 'dashed',
            },
        },
        // 边基础
        {
            selector: 'edge',
            style: {
                width: 2,
                'line-color': '#ccc',
                'curve-style': 'bezier',
            },
        },
        {
            selector: 'edge.edge-real',
            style: {
                'line-style': 'solid',
            },
        },
        {
            selector: 'edge.edge-virtual',
            style: {
                'line-style': 'dashed',
            },
        },
        {
            selector: 'edge.edge-directed',
            style: {
                'target-arrow-color': '#ccc',
                'target-arrow-shape': 'triangle',
            },
        },
        {
            selector: 'edge.edge-undirected',
            style: {
                'target-arrow-shape': 'none',
            },
        },
        // 沟通节点
        {
            selector: 'node.ref-communication',
            style: {
                'opacity': 0.5,
            },
        },
        // 删除目标高亮
        {
            selector: '.delete-target',
            style: {
                'border-width': 3,
                'border-color': '#ef4444',
                'border-style': 'solid',
            },
        },
        {
            selector: 'edge.delete-target',
            style: {
                'line-color': '#ef4444',
                width: 4,
                'target-arrow-color': '#ef4444',
            },
        },
        // 边添加起点高亮
        {
            selector: '.edge-source-target',
            style: {
                'border-width': 3,
                'border-color': '#3b82f6',
                'border-style': 'solid',
            },
        },
        // 折叠依赖指示
        {
            selector: '.has-folded-deps',
            style: {
                'border-width': 4,
                'border-color': '#9333ea',
                'border-style': 'double',
            },
        },
        // 移动工具：碰撞冲突高亮
        {
            selector: '.move-collision',
            style: {
                'border-color': '#ef4444',
            },
        },
        // 移动工具：已拾取节点半透明
        {
            selector: '.move-picked',
            style: {
                'opacity': 0.4,
            },
        },
        // 搜索定位提示（revealElement 施加，1.2s 后移除）
        {
            selector: 'node.search-focus',
            style: {
                'overlay-color': '#3b82f6',
                'overlay-opacity': 0.25,
                'overlay-padding': 10,
            },
        },
        {
            selector: 'edge.search-focus',
            style: {
                'line-color': '#3b82f6',
                'width': 4,
                'target-arrow-color': '#3b82f6',
            },
        },
    ]
}
