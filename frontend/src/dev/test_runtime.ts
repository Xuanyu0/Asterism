/**
 * test_runtime.ts
 *
 * 功能：
 * 作为开发阶段测试运行入口，统一初始化测试图数据。
 *
 * 总体结构：
 * 1. initTestRuntime：初始化开发测试环境
 * 2. 当前默认使用 mockGraph，后续可切换为 goldenGraph
 *
 * 外部使用方式：
 * import { initTestRuntime } from '@/dev/test_runtime'
 * initTestRuntime()
 */

import { useGraphStore } from '@/graph/graph_store'
import { mockGraph } from '@/mock/mockGraph'
import { goldenGraph } from '@/mock/golden_graph'

import { useUIStore } from '@/ui/ui_store'


export function initTestRuntime() {
    const graphStore = useGraphStore()    // 获取图状态 store

    graphStore.setCurrentGraph(goldenGraph)    // 设置当前测试图
}

/**
 * 功能：
 *     测试 GraphData 是否可以通过 graph_store 保存到本地，并再次加载回来。
 *
 * 规则：
 *     1. 先把 goldenGraph 设置为 currentGraph。
 *     2. 再调用 saveCurrentGraph() 写入 localStorage。
 *     3. 再清空 currentGraph。
 *     4. 最后调用 loadGraphToCurrent() 从 localStorage 读回。
 *
 * 使用：
 *     在 main.ts 或浏览器控制台临时调用 testGraphPersistenceRuntime()
 */
export function testGraphPersistenceRuntime(): void {
    const graphStore = useGraphStore()

    graphStore.setCurrentGraph(goldenGraph)
    graphStore.saveCurrentGraph()
    graphStore.currentGraph = null

    const isLoaded = graphStore.loadGraphToCurrent(goldenGraph.id)

    console.log('Graph persistence loaded:', isLoaded)
    console.log('Current graph:', graphStore.currentGraph)
}

/**
 * 功能：
 *     把开发期测试函数挂载到浏览器 window 对象。
 *
 * 规则：
 *     1. 只用于开发期手动测试。
 *     2. 不参与正式 UI 交互。
 *     3. 后续正式 UI 完成后可以删除。
 *
 * 使用：
 *     浏览器控制台输入：
 *         window.testGraphPersistenceRuntime()
 *         window.enterAddRealNodeMode()
 */
export function exposeTestRuntimeToWindow(): void {
    Object.assign(window, {
        testGraphPersistenceRuntime,
        enterAddRealNodeMode,
    })
}


/**
 * 功能：
 *     模拟用户进入 Add Node 流程。
 *
 * 规则：
 *     1. 只用于开发期测试。
 *     2. 不直接修改 GraphData。
 *     3. 只设置 UI Runtime 状态。
 *
 * 使用：
 *     浏览器控制台输入：
 *         window.enterAddRealNodeMode()
 */
export function enterAddRealNodeMode(): void {
    const uiStore = useUIStore()

    uiStore.setInteractionMode('operation')
    uiStore.selectOperationTool('add')
    uiStore.setAddTarget('node')
    uiStore.selectNodeKind('real')

    console.log('Enter Add Real Node Mode:', {
        interactionMode: uiStore.interactionMode,
        selectedOperationTool: uiStore.selectedOperationTool,
        pendingAddTarget: uiStore.pendingAddTarget,
        pendingNodeKind: uiStore.pendingAddNode.kind,
    })

}
