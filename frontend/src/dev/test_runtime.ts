/**
 * test_runtime.ts
 *
 * 功能：
 *     开发期测试运行入口。通过 test_case_factory 生成测试数据并加载到 graph_store。
 *     所有测试图均经过全量 schema 校验（GraphValidator.validateGraph）。
 *
 * 总体结构：
 *     1. initTestRuntime：应用启动时自动加载默认测试图
 *     2. exposeTestRuntimeToWindow：暴露测试函数到浏览器 window 对象
 *     3. P1 测试函数：切换当前图到各种拓扑
 *     4. P2 测试函数（占位）：多图层级操作
 *
 * 使用方式：
 *     main.ts 调用 initTestRuntime() + exposeTestRuntimeToWindow()
 *     浏览器控制台：
 *         window.loadGoldenGraph()
 *         window.loadChainDAG(5)
 *         window.loadEdgeMatrix()
 *         window.loadDeleteUndoGraph()
 *         window.loadVirtualNodeGraph()
 *         window.loadAbstractNodeGraph()
 *         window.loadCommunicationGraph()
 *
 *     浏览器控制台 UI 模式快捷切换：
 *         window.enterAddRealNodeMode()
 */

import { useGraphStore } from '@/graph/graph_store'
import { useToolRouter } from '@/interactions/router'

import {
    createGoldenTestGraph,
    createChainDAG,
    createEdgeMatrixGraph,
    createVirtualNodeTestGraph,
    createAbstractNodeTestGraph,
    createCommunicationTestGraph,
    createDeleteUndoTestGraph,
} from '@/mock/test_case_factory'

// ═══════════════════════════════════════════════════════════════
// 启动时初始化
// ═══════════════════════════════════════════════════════════════

/**
 * 功能：
 *     应用启动时加载默认测试图。
 *
 * 规则：
 *     1. Pinia 必须已安装（createPinia + app.use(pinia) 在 main.ts 中先执行）。
 *     2. 当前默认使用金牌测试图（覆盖所有已实现节点/边类型）。
 *     3. 如需换图，修改此处调用即可。
 */
export function initTestRuntime(): void {
    const graphStore = useGraphStore()

    graphStore.setGraphView(createGoldenTestGraph())
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
        loadChainDAG,
        loadEdgeMatrix,
        loadVirtualNodeGraph,
        loadAbstractNodeGraph,
        loadCommunicationGraph,
        loadDeleteUndoGraph,

        // UI 模式快捷切换
        enterAddRealNodeMode,
        enterAddVirtualNodeMode,
        enterAddRealDirectedMode,
        enterAddRealUndirectedMode,
        enterAddVirtualDirectedMode,
        enterAddVirtualUndirectedMode,
        enterDeleteMode,
        enterFoldMode,
    })
}

// ═══════════════════════════════════════════════════════════════
// P1: 图切换函数
// ═══════════════════════════════════════════════════════════════

/**
 * 功能：
 *     加载金牌测试图（冒烟测试，覆盖所有节点/边类型）。
 */
function loadGoldenGraph(): void {
    const graphStore = useGraphStore()

    graphStore.setGraphView(createGoldenTestGraph())

    console.log('✅ 已加载金牌测试图')
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

    graphStore.setGraphView(createChainDAG(n ?? 5))

    console.log(`✅ 已加载 ${n ?? 5} 节点链式 DAG`)
}

/**
 * 功能：
 *     加载 2×2 边矩阵测试图（覆盖全部 4 种边类型）。
 */
function loadEdgeMatrix(): void {
    const graphStore = useGraphStore()

    graphStore.setGraphView(createEdgeMatrixGraph())

    console.log('✅ 已加载 2×2 边矩阵测试图')
}

/**
 * 功能：
 *     加载虚节点连接规则测试图。
 */
function loadVirtualNodeGraph(): void {
    const graphStore = useGraphStore()

    graphStore.setGraphView(createVirtualNodeTestGraph())

    console.log('✅ 已加载虚节点测试图')
}

/**
 * 功能：
 *     加载抽象节点测试图。
 */
function loadAbstractNodeGraph(): void {
    const graphStore = useGraphStore()

    graphStore.setGraphView(createAbstractNodeTestGraph())

    console.log('✅ 已加载抽象节点测试图')
}

/**
 * 功能：
 *     加载沟通节点/边测试图。
 */
function loadCommunicationGraph(): void {
    const graphStore = useGraphStore()

    graphStore.setGraphView(createCommunicationTestGraph())

    console.log('✅ 已加载沟通节点/边测试图')
}

/**
 * 功能：
 *     加载删除/撤销测试图。
 */
function loadDeleteUndoGraph(): void {
    const graphStore = useGraphStore()

    graphStore.setGraphView(createDeleteUndoTestGraph())

    console.log('✅ 已加载删除/撤销测试图')
}

// ═══════════════════════════════════════════════════════════════
// P1: UI 模式快捷切换
// ═══════════════════════════════════════════════════════════════

/**
 * 功能：
 *     模拟用户进入 Add Real Node 流程。
 *
 * 规则：
 *     1. 通过 operation_controller 设置 UI Runtime 状态，与正式 UI 交互路径一致。
 *
 * 使用：
 *     浏览器控制台输入 window.enterAddRealNodeMode()
 */
function enterAddRealNodeMode(): void {
    const router = useToolRouter()

    router.activate('add-real-node')

    console.log('✅ 已进入 Add Real Node 模式')
}

/**
 * 功能：
 *     模拟用户进入 Add Virtual Node 流程。
 */
function enterAddVirtualNodeMode(): void {
    const router = useToolRouter()

    router.activate('add-virtual-node')

    console.log('✅ 已进入 Add Virtual Node 模式')
}

/**
 * 功能：
 *     模拟用户进入 Delete 模式。
 */
function enterDeleteMode(): void {
    const router = useToolRouter()

    router.activate('delete')

    console.log('✅ 已进入 Delete 模式')
}

/**
 * 功能：
 *     模拟用户进入 Fold 模式。
 */
function enterFoldMode(): void {
    const router = useToolRouter()

    router.activate('fold')

    console.log('✅ 已进入 Fold 模式')
}

/**
 * 功能：
 *     模拟用户进入 Add Real Directed Edge 流程。
 */
function enterAddRealDirectedMode(): void {
    const router = useToolRouter()

    router.activate('add-real-directed')

    console.log('✅ 已进入 Add Real Directed Edge 模式')
}

/**
 * 功能：
 *     模拟用户进入 Add Real Undirected Edge 流程。
 */
function enterAddRealUndirectedMode(): void {
    const router = useToolRouter()

    router.activate('add-real-undirected')

    console.log('✅ 已进入 Add Real Undirected Edge 模式')
}

/**
 * 功能：
 *     模拟用户进入 Add Virtual Directed Edge 流程。
 */
function enterAddVirtualDirectedMode(): void {
    const router = useToolRouter()

    router.activate('add-virtual-directed')

    console.log('✅ 已进入 Add Virtual Directed Edge 模式')
}

/**
 * 功能：
 *     模拟用户进入 Add Virtual Undirected Edge 流程。
 */
function enterAddVirtualUndirectedMode(): void {
    const router = useToolRouter()

    router.activate('add-virtual-undirected')

    console.log('✅ 已进入 Add Virtual Undirected Edge 模式')
}
