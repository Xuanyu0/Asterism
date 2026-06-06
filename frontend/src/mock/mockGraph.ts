import type { GraphData } from '@/definitions/types/graph_types' // 导入 GraphData 类型

export const mockGraph: GraphData = {
    id: 'graph-main', // 主图 ID
    kind: 'main', // 主图类型
    title: '高等数学', // 图标题

    nodes: [
        {
            id: 'node-limit',
            graphId: 'graph-main',
            role: 'knowledge',
            kind: 'real',
            form: 'atomic',
            label: '极限',
            summary: '函数变化趋势的描述',
            abstractionLevel: 0,
            degree: 1,
        },

        {
            id: 'node-derivative',
            graphId: 'graph-main',
            role: 'knowledge',
            kind: 'real',
            form: 'atomic',
            label: '导数',
            summary: '函数局部变化率',
            abstractionLevel: 0,
            degree: 1,
        },

        {
            id: 'node-integral',
            graphId: 'graph-main',
            role: 'knowledge',
            kind: 'virtual',
            label: '积分',
            abstractionLevel: 0,
            degree: 1,
        },
    ],

    edges: [
        {
            id: 'edge-limit-derivative',
            graphId: 'graph-main',
            source: 'node-limit',
            target: 'node-derivative',
            kind: 'real',
            direction: 'directed',
            viewRole: 'normal',
            label: '前置',
        },

        {
            id: 'edge-derivative-integral',
            graphId: 'graph-main',
            source: 'node-derivative',
            target: 'node-integral',
            kind: 'virtual',
            direction: 'undirected',
            viewRole: 'normal',
            label: '相关',
        },
    ],
}
