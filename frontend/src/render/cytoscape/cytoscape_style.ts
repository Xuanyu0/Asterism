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
        {
            selector: 'node',
            style: {
                'background-color': '#666',
                label: 'data(label)',
            },
        },
        {
            selector: 'edge',
            style: {
                width: 2,
                'line-color': '#ccc',
                'target-arrow-color': '#ccc',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
            },
        },
    ]
}
