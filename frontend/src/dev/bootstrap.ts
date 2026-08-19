/**
 * bootstrap.ts
 *
 * 功能：
 *     开发期测试工具的总装入口。main.ts 调 bootstrapDevTools() 即可一次性
 *     注册全部开发期测试设施（加载默认测试图 + 浏览器控制台 API + 验收测试机）。
 *
 * 规则：
 *     1. 无前置初始化——内部 useGraphStore 为模块级单例，懒创建。
 *     2. 路由挂载先后不影响——本函数只挂 window 对象 + 加载测试数据，不依赖路由。
 *     3. 金图与银图均通过 graphStore 操作路径（createRootGraph → commitToCurrentGraph × 3）
 *        构造，与用户实际操作路径一致。
 */

import type { GraphId, NodeId, EdgeId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'

export function bootstrapDevTools(): void {
    const graphStore = useGraphStore()
    const operations = useGraphOperationAdapter()

    // ═══════ 金牌测试图构造（graphStore 操作路径） ═══════

    // createRootGraph 幂等——指定 ID，图已存在则跳过创建
    const GOLDEN_ID = graphStore.createRootGraph('金牌测试图', {
        id: 'graph-golden' as GraphId,
    })
    graphStore.loadGraphToView(GOLDEN_ID)

    // 首次创建：空图 = 未曾构造过节点/边/子图
    if (graphStore.graphView!.nodes.length === 0) {
        const gId = graphStore.graphView!.id

        // — 金图节点（6 个，一批） —
        operations.commitToCurrentGraph([
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'node-g1' as NodeId,
                    graphId: gId,
                    kind: 'real',
                    label: '知识节点A',
                    degree: 0,
                    position: { x: 50, y: 200 },
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'node-g2' as NodeId,
                    graphId: gId,
                    kind: 'real',
                    label: '知识节点B',
                    degree: 0,
                    position: { x: 350, y: 200 },
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'node-g3' as NodeId,
                    graphId: gId,
                    kind: 'real',
                    label: '抽象节点',
                    degree: 0,
                    position: { x: 650, y: 200 },
                    childGraphId: 'sub-golden' as GraphId,
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'node-g4' as NodeId,
                    graphId: gId,
                    kind: 'virtual',
                    label: '虚节点',
                    degree: 0,
                    position: { x: 950, y: 200 },
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'reference',
                    id: 'node-g5' as NodeId,
                    graphId: gId,
                    referenceKind: 'communication',
                    label: '跳转银牌',
                    degree: 0,
                    position: { x: 50, y: 500 },
                    sourceGraphId: 'graph-silver' as GraphId,
                    sourceNodeId: 'sv-node-1' as NodeId,
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'node-g6' as NodeId,
                    graphId: gId,
                    kind: 'real',
                    label: '知识节点C',
                    degree: 0,
                    position: { x: 350, y: 500 },
                },
            },
        ])

        // — 金图边（4 条，单独 batch——节点必须已存在） —
        operations.commitToCurrentGraph([
            {
                type: 'add_edge',
                edge: {
                    id: 'edge-g12' as EdgeId,
                    graphId: gId,
                    source: 'node-g1' as NodeId,
                    target: 'node-g2' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                    label: '',
                },
            },
            {
                type: 'add_edge',
                edge: {
                    id: 'edge-g23' as EdgeId,
                    graphId: gId,
                    source: 'node-g2' as NodeId,
                    target: 'node-g3' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                    label: '',
                },
            },
            {
                type: 'add_edge',
                edge: {
                    id: 'edge-g46' as EdgeId,
                    graphId: gId,
                    source: 'node-g4' as NodeId,
                    target: 'node-g6' as NodeId,
                    kind: 'virtual',
                    direction: 'undirected',
                    label: '',
                },
            },
            {
                type: 'add_edge',
                edge: {
                    id: 'edge-g51' as EdgeId,
                    graphId: gId,
                    source: 'node-g5' as NodeId,
                    target: 'node-g1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                    label: '',
                },
            },
        ])

        // — 金图子图（add_graph 信号操作） —
        operations.commitToCurrentGraph([
            {
                type: 'add_graph',
                graph: {
                    id: 'sub-golden' as GraphId,
                    kind: 'subgraph',
                    title: '金牌子图',
                    parentGraphId: gId,
                    ownerNodeId: 'node-g3' as NodeId,
                    nodes: [
                        {
                            role: 'knowledge',
                            id: 'sub-g1' as NodeId,
                            graphId: 'sub-golden' as GraphId,
                            kind: 'real',
                            label: '子图节点A',
                            degree: 0,
                            position: { x: 200, y: 200 },
                        },
                        {
                            role: 'knowledge',
                            id: 'sub-g2' as NodeId,
                            graphId: 'sub-golden' as GraphId,
                            kind: 'real',
                            label: '子图节点B',
                            degree: 0,
                            position: { x: 500, y: 200 },
                        },
                    ],
                    edges: [
                        {
                            id: 'edge-sg12' as EdgeId,
                            graphId: 'sub-golden' as GraphId,
                            source: 'sub-g1' as NodeId,
                            target: 'sub-g2' as NodeId,
                            kind: 'real',
                            direction: 'directed',
                            label: '',
                        },
                    ],
                    cognitiveState: { foldedDependencies: [] },
                },
            },
        ])
    }

    // ═══════ 银牌测试图构造（graphStore 操作路径，与金图一致） ═══════

    const SILVER_ID = graphStore.createRootGraph('银牌测试图', {
        id: 'graph-silver' as GraphId,
    })
    graphStore.loadGraphToView(SILVER_ID)

    if (graphStore.graphView!.nodes.length === 0) {
        const sId = graphStore.graphView!.id

        // — 银图节点（5 个，一批） —
        operations.commitToCurrentGraph([
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'sv-node-1' as NodeId,
                    graphId: sId,
                    kind: 'real',
                    label: '跳转目标',
                    degree: 0,
                    position: { x: 50, y: 200 },
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'sv-node-2' as NodeId,
                    graphId: sId,
                    kind: 'real',
                    label: '银牌节点B',
                    degree: 0,
                    position: { x: 350, y: 200 },
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'sv-node-3' as NodeId,
                    graphId: sId,
                    kind: 'real',
                    label: '抽象节点',
                    degree: 0,
                    position: { x: 650, y: 200 },
                    childGraphId: 'sub-silver' as GraphId,
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'reference',
                    id: 'sv-node-4' as NodeId,
                    graphId: sId,
                    referenceKind: 'communication',
                    label: '回金牌',
                    degree: 0,
                    position: { x: 50, y: 500 },
                    sourceGraphId: 'graph-golden' as GraphId,
                    sourceNodeId: 'node-g1' as NodeId,
                },
            },
            {
                type: 'add_node',
                node: {
                    role: 'knowledge',
                    id: 'sv-node-5' as NodeId,
                    graphId: sId,
                    kind: 'real',
                    label: '银牌节点E',
                    degree: 0,
                    position: { x: 350, y: 500 },
                },
            },
        ])

        // — 银图边（3 条，单独 batch——节点必须已存在） —
        operations.commitToCurrentGraph([
            {
                type: 'add_edge',
                edge: {
                    id: 'edge-sv12' as EdgeId,
                    graphId: sId,
                    source: 'sv-node-1' as NodeId,
                    target: 'sv-node-2' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                    label: '',
                },
            },
            {
                type: 'add_edge',
                edge: {
                    id: 'edge-sv23' as EdgeId,
                    graphId: sId,
                    source: 'sv-node-2' as NodeId,
                    target: 'sv-node-3' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                    label: '',
                },
            },
            {
                type: 'add_edge',
                edge: {
                    id: 'edge-sv45' as EdgeId,
                    graphId: sId,
                    source: 'sv-node-4' as NodeId,
                    target: 'sv-node-5' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                    label: '',
                },
            },
        ])

        // — 银子图（add_graph 信号操作） —
        operations.commitToCurrentGraph([
            {
                type: 'add_graph',
                graph: {
                    id: 'sub-silver' as GraphId,
                    kind: 'subgraph',
                    title: '银牌子图',
                    parentGraphId: sId,
                    ownerNodeId: 'sv-node-3' as NodeId,
                    nodes: [
                        {
                            role: 'knowledge',
                            id: 'sv-sub-1' as NodeId,
                            graphId: 'sub-silver' as GraphId,
                            kind: 'real',
                            label: '银牌子节点A',
                            degree: 0,
                            position: { x: 200, y: 200 },
                        },
                        {
                            role: 'knowledge',
                            id: 'sv-sub-2' as NodeId,
                            graphId: 'sub-silver' as GraphId,
                            kind: 'real',
                            label: '银牌子节点B',
                            degree: 0,
                            position: { x: 500, y: 200 },
                        },
                    ],
                    edges: [
                        {
                            id: 'edge-ss12' as EdgeId,
                            graphId: 'sub-silver' as GraphId,
                            source: 'sv-sub-1' as NodeId,
                            target: 'sv-sub-2' as NodeId,
                            kind: 'real',
                            direction: 'directed',
                            label: '',
                        },
                    ],
                    cognitiveState: { foldedDependencies: [] },
                },
            },
        ])
    }

    // 切回金图视图（bootstrap 完成后画布默认显示金图）
    graphStore.loadGraphToView(GOLDEN_ID)
}
