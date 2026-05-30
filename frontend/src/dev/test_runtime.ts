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
