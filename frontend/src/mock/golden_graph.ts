/**
 * golden_graph.ts
 *
 * 金牌测试数据：6 个节点，覆盖常见节点/边类型
 * 适用于前端 MVP 冒烟测试、Validator 功能验证
 *
 * 使用方式：
 * import { goldenGraph } from '@/mock/golden_graph'
 * graphStore.setGraphView(goldenGraph)
 */

import type { GraphData } from '@my-project/graph-engine'

export const goldenGraph: GraphData = {
    id: 'graph-golden',
    kind: 'main',
    title: '金牌测试图',
    nodes: [
        {
            id: 'node-1',
            graphId: 'graph-golden',
            role: 'knowledge',
            kind: 'real',
            form: 'atomic',
            label: '节点1',
            summary: '普通实节点',
            abstractionLevel: 0,
            degree: 1,
            position: { x: 50, y: 120 },
        },
        {
            id: 'node-2',
            graphId: 'graph-golden',
            role: 'knowledge',
            kind: 'real',
            form: 'atomic',
            label: '节点2',
            summary: '普通实节点',
            abstractionLevel: 0,
            degree: 3,
            position: { x: 350, y: 120 },
        },
        {
            id: 'node-3',
            graphId: 'graph-golden',
            role: 'knowledge',
            kind: 'real',
            form: 'abstract',
            label: '抽象节点3',
            summary: '抽象节点示例',
            abstractionLevel: 1,
            degree: 1,
            childGraphId: 'graph-sub-3',
            position: { x: 650, y: 120 },
        },
        {
            id: 'node-4',
            graphId: 'graph-golden',
            role: 'knowledge',
            kind: 'virtual',
            label: '虚节点4',
            abstractionLevel: 0,
            degree: 1,
            position: { x: 950, y: 120 },
        },
        {
            id: 'node-5',
            graphId: 'graph-golden',
            role: 'reference',
            referenceKind: 'communication',
            label: '沟通节点5',
            abstractionLevel: 0,
            degree: 1,
            sourceGraphId: 'graph-golden',
            sourceNodeId: 'node-1',
            position: { x: 50, y: 520 },
        },
        {
            id: 'node-6',
            graphId: 'graph-golden',
            role: 'knowledge',
            kind: 'real',
            form: 'atomic',
            label: '节点6',
            summary: '普通实节点',
            abstractionLevel: 0,
            degree: 1,
            position: { x: 150, y: 520 },
        },
    ],
    edges: [
        // 有向实边
        {
            id: 'edge-1-2',
            graphId: 'graph-golden',
            source: 'node-1',
            target: 'node-2',
            kind: 'real',
            direction: 'directed',
            label: '有向边1->2',
        },
        // 有向实边
        {
            id: 'edge-2-3',
            graphId: 'graph-golden',
            source: 'node-2',
            target: 'node-3',
            kind: 'real',
            direction: 'directed',
            label: '有向边2->3',
        },
        // 无向虚边
        {
            id: 'edge-4-6',
            graphId: 'graph-golden',
            source: 'node-4',
            target: 'node-6',
            kind: 'virtual',
            direction: 'undirected',
            label: '虚边4-6',
        },
        // 边连接 communication 节点 node-5 → node-2。
        // 沟通边的视觉样式（半悬空/淡化）由渲染层根据
        // 端点节点是否为 communication 节点推导得出。
        {
            id: 'edge-5-2',
            graphId: 'graph-golden',
            source: 'node-5',
            target: 'node-2',
            kind: 'real',
            direction: 'directed',
            label: '沟通边5->2',
        },
    ],
}
