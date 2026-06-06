/**
 * 功能：
 *     提供 Cytoscape 渲染样式配置。
 *
 * 总体结构：
 *     1. createCytoscapeStyle()
 *
 * 外部如何使用：
 *     use_cytoscape_renderer.ts 调用本文件获取 Cytoscape 样式。
 *
 */


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
        // --- 节点基础 ---
        {
            selector: 'node',
            style: {
                'background-color': '#666',
                'border-width': 2,
                label: 'data(label)',
            },
        },
        // 实节点：实线边框
        {
            selector: 'node.node-real',
            style: {
                'border-color': '#475569',
                'border-style': 'solid',
            },
        },
        // 虚节点：虚线边框
        {
            selector: 'node.node-virtual',
            style: {
                'border-color': '#94a3b8',
                'border-style': 'dashed',
            },
        },
        // --- 边基础 ---
        {
            selector: 'edge',
            style: {
                width: 2,
                'line-color': '#ccc',
                'curve-style': 'bezier',
            },
        },
        // 实边：实线
        {
            selector: 'edge.edge-real',
            style: {
                'line-style': 'solid',
            },
        },
        // 虚边：虚线
        {
            selector: 'edge.edge-virtual',
            style: {
                'line-style': 'dashed',
            },
        },
        // 有向边：箭头
        {
            selector: 'edge.edge-directed',
            style: {
                'target-arrow-color': '#ccc',
                'target-arrow-shape': 'triangle',
            },
        },
        // 无向边：无箭头
        {
            selector: 'edge.edge-undirected',
            style: {
                'target-arrow-shape': 'none',
            },
        },
        // 沟通节点：半透明
        {
            selector: 'node.ref-communication',
            style: {
                'opacity': 0.5,
            },
        },
        // --- 删除目标高亮 ---
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
    ]
}
