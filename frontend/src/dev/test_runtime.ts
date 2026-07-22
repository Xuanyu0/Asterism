/**
 * test_runtime.ts
 *
 * 功能：
 *     开发期测试运行入口。金牌图构造逻辑已迁入 bootstrap.ts（graphStore 操作路径）。
 *     本文件仅保留浏览器控制台 API（window.loadXXX）和各测试图的重载函数。
 *
 * 总体结构：
 *     1. initTestRuntime：空函数（构造逻辑已迁入 bootstrap.ts）
 *     2. exposeTestRuntimeToWindow：暴露测试函数到浏览器 window 对象
 *     3. 测试函数：从 localStorage 重载各测试图
 *
 * 使用方式：
 *     bootstrap.ts 中 inline 构造金牌图并调用 exposeTestRuntimeToWindow()
 *     浏览器控制台：
 *         window.loadGoldenGraph()
 *         window.loadChainDAG(5)
 *         window.loadEdgeMatrix()
 *         window.loadDeleteUndoGraph()
 *         window.loadVirtualNodeGraph()
 *         window.loadAbstractNodeGraph()
 *         window.loadCommunicationGraph()
 */
import { useGraphStore } from '@/graph/graph_store'
import { saveGraph, loadGraph } from '@/graph/graph_persistence'

import {
    createSilverTestGraph,
    createChainDAG,
    createEdgeMatrixGraph,
    createVirtualNodeTestGraph,
    createAbstractNodeTestGraph,
    createCommunicationTestGraph,
    createDeleteUndoTestGraph,
} from '@/dev/test_case_factory'
import type { GraphId } from '@my-project/graph-engine'

// ═══════════════════════════════════════════════════════════════
// 启动时初始化（现为空函数——构造逻辑已迁入 bootstrap.ts）
// ═══════════════════════════════════════════════════════════════

/**
 * 功能：
 *     应用启动时初始化函数。金牌图构造逻辑已迁入 bootstrap.ts，
 *     本函数保留为空以保持 API 兼容。
 */
export function initTestRuntime(): void {
    // 构造逻辑已迁移至 bootstrap.ts -> bootstrapDevTools()
}

// ═══════════════════════════════════════════════════════════════
// 暴露到浏览器 window 的测试函数
// ═══════════════════════════════════════════════════════════════

/**
 * 功能：
 *     把开发期测试函数挂载到浏览器 window 对象。
 *
 * 规则：
 *     1. 只用于开发期手动测试，不参与正式 UI 交互。
 *     2. 后续正式 UI 完成后可以删除。
 *
 * 使用：
 *     浏览器控制台输入 window.loadGoldenGraph() 等。
 */
export function exposeTestRuntimeToWindow(): void {
    Object.assign(window, {
        // P1 图切换
        loadGoldenGraph,
        loadSilverGraph,
        loadChainDAG,
        loadEdgeMatrix,
        loadVirtualNodeGraph,
        loadAbstractNodeGraph,
        loadCommunicationGraph,
        loadDeleteUndoGraph,
    })
}

// ═══════════════════════════════════════════════════════════════
// P1: 图切换函数
// ═══════════════════════════════════════════════════════════════

/**
 * 功能：
 *     从 localStorage 重载金牌测试图（bootstrap.ts 已预先构造并持久化）。
 */
function loadGoldenGraph(): void {
    const graphStore = useGraphStore()

    const graph = loadGraph('graph-golden' as GraphId)
    if (graph) {
        graphStore.loadGraphToView(graph.id)
        console.log('✅ 已加载金牌测试图（含子图+银牌对）')
    } else {
        console.error('❌ 金牌测试图未找到。请通过 bootstrapDevTools() 构造。')
    }
}

/**
 * 功能：
 *     加载银牌测试图（从 localStorage 读取，若不存在则构造并持久化）。
 *
 * 使用：
 *     window.loadSilverGraph()
 */
function loadSilverGraph(): void {
    const graphStore = useGraphStore()

    let graph = loadGraph('graph-silver' as GraphId)
    if (!graph) {
        graph = createSilverTestGraph()
        saveGraph(graph)
    }
    graphStore.loadGraphToView(graph.id)

    console.log('✅ 已加载银牌测试图')
}

/**
 * 功能：
 *     加载 n 节点链式 DAG（测试 fold/expand）。
 *
 * 使用：
 *     window.loadChainDAG()     → 默认 5 节点
 *     window.loadChainDAG(8)    → 8 节点
 */
function loadChainDAG(n?: number): void {
    const graphStore = useGraphStore()

    const graph = createChainDAG(n ?? 5)
    saveGraph(graph)
    graphStore.loadGraphToView(graph.id)

    console.log(`✅ 已加载 ${n ?? 5} 节点链式 DAG`)
}

/**
 * 功能：
 *     加载 2×2 边矩阵测试图（覆盖全部 4 种边类型）。
 */
function loadEdgeMatrix(): void {
    const graphStore = useGraphStore()

    const graph = createEdgeMatrixGraph()
    saveGraph(graph)
    graphStore.loadGraphToView(graph.id)

    console.log('✅ 已加载 2×2 边矩阵测试图')
}

/**
 * 功能：
 *     加载虚节点连接规则测试图。
 */
function loadVirtualNodeGraph(): void {
    const graphStore = useGraphStore()

    const graph = createVirtualNodeTestGraph()
    saveGraph(graph)
    graphStore.loadGraphToView(graph.id)

    console.log('✅ 已加载虚节点测试图')
}

/**
 * 功能：
 *     加载抽象节点测试图。
 */
function loadAbstractNodeGraph(): void {
    const graphStore = useGraphStore()

    const graph = createAbstractNodeTestGraph()
    saveGraph(graph)
    graphStore.loadGraphToView(graph.id)

    console.log('✅ 已加载抽象节点测试图')
}

/**
 * 功能：
 *     加载沟通节点/边测试图。
 */
function loadCommunicationGraph(): void {
    const graphStore = useGraphStore()

    const graph = createCommunicationTestGraph()
    saveGraph(graph)
    graphStore.loadGraphToView(graph.id)

    console.log('✅ 已加载沟通节点/边测试图')
}

/**
 * 功能：
 *     加载删除/撤销测试图。
 */
function loadDeleteUndoGraph(): void {
    const graphStore = useGraphStore()

    const graph = createDeleteUndoTestGraph()
    saveGraph(graph)
    graphStore.loadGraphToView(graph.id)

    console.log('✅ 已加载删除/撤销测试图')
}
