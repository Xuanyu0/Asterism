/**
 * 开发期测试工具的总装入口。
 *
 * @remarks
 * 浏览器控制台调用 {@link bootstrapDevTools} 即可一次性注入默认测试图（金牌树，
 * 银图作为其子图）并展示。规则：
 * 1. 无前置初始化 —— 内部 useGraphStore 为模块级单例，懒创建。
 * 2. 不随应用启动自动执行 —— main.ts 仅加载本模块（副作用：挂载 window.bootstrapDevTools），
 *    需要在浏览器控制台手动执行 bootstrapDevTools() 注入种子数据。
 * 3. 路由挂载先后不影响 —— 本函数只加载测试数据，不依赖路由。
 * 4. 全部图内容经导航/操作用例层（createRootGraph / commitToCurrentGraph）构造，与用户实际
 *    操作路径一致；子图按用户路径「先 add_graph 建空图、再图内批填充」构造。
 */

import type { GraphId, NodeId, EdgeId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperation } from '@/graph/use-case/useGraphOperation'
import { useNavigation } from '@/graph/use-case/useNavigation'

declare global {
    interface Window {
        bootstrapDevTools: () => void
    }
}

export function bootstrapDevTools(): void {
    const graphStore = useGraphStore()
    const navigation = useNavigation()

    // createRootGraph 幂等——指定 ID，图已存在则跳过创建
    const GOLDEN_ID = navigation.createRootGraph('金牌测试图', {
        id: 'graph-golden' as GraphId,
    })
    graphStore.loadGraphToView(GOLDEN_ID)

    // 首次创建：空图 = 未曾构造过节点/边/子图
    if (graphStore.graphView!.nodes.length === 0) {
        seedGoldenTree()

        // 切回金图视图（种子构造过程中视图在子树间切换，bootstrap 完成后画布默认显示金图）
        graphStore.loadGraphToView(GOLDEN_ID)
    }
}

/**
 * 构造金图树种子：金图（根）挂 sub-golden 与银图两个子图，银图再挂 sub-silver。
 *
 * @remarks
 * 金 / 银两条跨图引用节点（金→银 `node-g5`、银→金 `sv-node-4`）都保留；银图是金图树的
 * 子图（`parentGraphId` 指向金图），故两条引用都闭合在同一棵树内。
 * 调用前提：金图已创建且当前视图为金图（bootstrapDevTools 保证）。
 */
function seedGoldenTree(): void {
    const graphStore = useGraphStore()
    const operations = useGraphOperation()

    // ═══════ 空子图骨架（graphLevel 批先建空图；add_graph 只构造空图，内容由后续图内批填充） ═══════

    operations.commitToCurrentGraph([
        {
            type: 'add_graph',
            graph: {
                id: 'sub-golden' as GraphId,
                kind: 'subgraph',
                title: '金牌子图',
                parentGraphId: 'graph-golden' as GraphId,
                ownerNodeId: 'node-g3' as NodeId,
                nodes: [],
                edges: [],
                cognitiveState: { foldedDependencies: [] },
            },
        },
        {
            // 银图挂进金图树内成为子图：让金→银与银→金两条引用都落在同一棵树内
            type: 'add_graph',
            graph: {
                id: 'graph-silver' as GraphId,
                kind: 'subgraph',
                title: '银牌测试图',
                parentGraphId: 'graph-golden' as GraphId,
                ownerNodeId: 'node-g7' as NodeId,
                nodes: [],
                edges: [],
                cognitiveState: { foldedDependencies: [] },
            },
        },
        {
            type: 'add_graph',
            graph: {
                id: 'sub-silver' as GraphId,
                kind: 'subgraph',
                title: '银牌子图',
                parentGraphId: 'graph-silver' as GraphId,
                ownerNodeId: 'sv-node-3' as NodeId,
                nodes: [],
                edges: [],
                cognitiveState: { foldedDependencies: [] },
            },
        },
    ])

    // ═══════ 金图内容（根图） ═══════

    const gId = 'graph-golden' as GraphId

    // — 金图节点（7 个，一批；node-g7 为银图挂入金图的抽象节点） —
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
        {
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'node-g7' as NodeId,
                graphId: gId,
                kind: 'real',
                label: '抽象节点（银）',
                degree: 0,
                position: { x: 650, y: 500 },
                childGraphId: 'graph-silver' as GraphId,
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

    // ═══════ 金牌子图内容 ═══════

    graphStore.loadGraphToView('sub-golden' as GraphId)

    operations.commitToCurrentGraph([
        {
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'sub-g1' as NodeId,
                graphId: 'sub-golden' as GraphId,
                kind: 'real',
                label: '子图节点A',
                degree: 0,
                position: { x: 200, y: 200 },
            },
        },
        {
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'sub-g2' as NodeId,
                graphId: 'sub-golden' as GraphId,
                kind: 'real',
                label: '子图节点B',
                degree: 0,
                position: { x: 500, y: 200 },
            },
        },
    ])

    operations.commitToCurrentGraph([
        {
            type: 'add_edge',
            edge: {
                id: 'edge-sg12' as EdgeId,
                graphId: 'sub-golden' as GraphId,
                source: 'sub-g1' as NodeId,
                target: 'sub-g2' as NodeId,
                kind: 'real',
                direction: 'directed',
                label: '',
            },
        },
    ])

    // ═══════ 银图内容（金图树的子图） ═══════

    graphStore.loadGraphToView('graph-silver' as GraphId)

    const sId = 'graph-silver' as GraphId

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

    // ═══════ 银牌子图内容 ═══════

    graphStore.loadGraphToView('sub-silver' as GraphId)

    operations.commitToCurrentGraph([
        {
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'sv-sub-1' as NodeId,
                graphId: 'sub-silver' as GraphId,
                kind: 'real',
                label: '银牌子节点A',
                degree: 0,
                position: { x: 200, y: 200 },
            },
        },
        {
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'sv-sub-2' as NodeId,
                graphId: 'sub-silver' as GraphId,
                kind: 'real',
                label: '银牌子节点B',
                degree: 0,
                position: { x: 500, y: 200 },
            },
        },
    ])

    operations.commitToCurrentGraph([
        {
            type: 'add_edge',
            edge: {
                id: 'edge-ss12' as EdgeId,
                graphId: 'sub-silver' as GraphId,
                source: 'sv-sub-1' as NodeId,
                target: 'sv-sub-2' as NodeId,
                kind: 'real',
                direction: 'directed',
                label: '',
            },
        },
    ])
}

// 供浏览器控制台手动触发（不随应用启动自动执行——见 main.ts 接线注释）
window.bootstrapDevTools = bootstrapDevTools
