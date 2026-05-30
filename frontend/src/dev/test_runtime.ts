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

import { useGraphStore } from '@/stores/graph_store'
import { mockGraph } from '@/mock/mockGraph'
import { goldenGraph } from '@/mock/golden_graph'

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
