/**
 * golden_graph.ts
 *
 * 金牌测试数据：6 个节点，覆盖常见节点/边类型
 * 适用于前端 MVP 冒烟测试、Validator 功能验证
 *
 * 使用方式：
 * import { goldenGraph } from '@/mock/golden_graph'
 * graphStore.setCurrentGraph(goldenGraph)
 */

import type { GraphData, NodeData, EdgeData } from '@/definitions/types/graph_types'

export const goldenGraph: GraphData = {
    id: 'graph-golden',
    kind: 'main',
    title: '金牌测试图',
    nodes: [
        // 普通实节点
        {
            id: 'node-1',
            graphId: 'graph-golden',
            kind: 'real',
            form: 'normal',
            viewRole: 'normal',
            label: '节点1',
            summary: '普通实节点',
            abstractionLevel: 0,
            degree: 2,
        },
        {
            id: 'node-2',
            graphId: 'graph-golden',
            kind: 'real',
            form: 'normal',
            viewRole: 'normal',
            label: '节点2',
            summary: '普通实节点',
            abstractionLevel: 0,
            degree: 2,
        },
        // 抽象实节点
        {
            id: 'node-3',
            graphId: 'graph-golden',
            kind: 'real',
            form: 'abstract',
            viewRole: 'normal',
            label: '抽象节点3',
            summary: '抽象节点示例',
            abstractionLevel: 1,
            degree: 2,
            childGraphId: 'graph-sub-3',
        },
        // 虚节点
        {
            id: 'node-4',
            graphId: 'graph-golden',
            kind: 'virtual',
            viewRole: 'normal',
            label: '虚节点4',
            abstractionLevel: 0,
            degree: 1,
        },
        // 沟通节点（引用 node-1）
        {
            id: 'node-5',
            graphId: 'graph-golden',
            kind: 'real',
            form: 'normal',
            viewRole: 'communication',
            label: '沟通节点5',
            abstractionLevel: 0,
            degree: 1,
            sourceGraphId: 'graph-golden',
            sourceNodeId: 'node-1',
        },
        // 普通实节点
        {
            id: 'node-6',
            graphId: 'graph-golden',
            kind: 'real',
            form: 'normal',
            viewRole: 'normal',
            label: '节点6',
            summary: '普通实节点',
            abstractionLevel: 0,
            degree: 1,
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
            viewRole: 'normal',
            label: '有向边1->2',
        },
        // 无向实边
        {
            id: 'edge-2-3',
            graphId: 'graph-golden',
            source: 'node-2',
            target: 'node-3',
            kind: 'real',
            direction: 'undirected',
            viewRole: 'normal',
            label: '无向边2-3',
        },
        // 无向虚边
        {
            id: 'edge-4-6',
            graphId: 'graph-golden',
            source: 'node-4',
            target: 'node-6',
            kind: 'virtual',
            direction: 'undirected',
            viewRole: 'normal',
            label: '虚边4-6',
        },
        // 沟通边（引用 edge-1-2）
        {
            id: 'edge-5-2',
            graphId: 'graph-golden',
            source: 'node-5',
            target: 'node-2',
            kind: 'real',
            direction: 'directed',
            viewRole: 'communication',
            label: '沟通边5->2',
            sourceGraphId: 'graph-golden',
            sourceEdgeId: 'edge-1-2',
        },
    ],
}
