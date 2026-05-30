/**
 * validator_smoke_test.ts
 *
 * 功能：
 * 临时测试 GraphData、OperationValidator、GraphValidator、graph_store 的基础链路。
 *
 * 总体结构：
 * 1. 初始化 mockGraph
 * 2. 测试合法更新节点
 * 3. 测试非法长标签
 * 4. 测试非法自环边
 * 5. 测试全图校验
 *
 * 外部使用方式：
 * 在 main.ts 的 app.use(pinia) 之后调用：
 * runValidatorSmokeTest()
 */

import { useGraphStore } from '@/stores/graph_store'
import { GraphValidator } from '@/definations/graph_validator'
import type { GraphOperation } from '@/definations/types/graph_operation_types'
import { goldenGraph } from '@/mock/golden_graph.ts'

export function runValidatorSmokeTest() {
    const graphStore = useGraphStore()    // 获取图状态 store

    graphStore.setCurrentGraph(goldenGraph)    // 初始化当前图

    console.log('初始图：', graphStore.currentGraph)    // 输出初始图

    const firstNode = goldenGraph.nodes[0]    // 取第一个节点
    const firstEdge = goldenGraph.edges[0]    // 取第一条边

    const updateNodeOperation: GraphOperation = {
        type: 'update_node',
        node: {
            ...firstNode,
            label: `${firstNode.label}测试`,
        },
    }    // 构造合法节点更新操作

    const updateNodeResult = graphStore.applyOperation(updateNodeOperation)    // 执行合法节点更新

    console.log('合法更新节点结果：', updateNodeResult)    // 应该 valid = true

    const longLabelOperation: GraphOperation = {
        type: 'update_node',
        node: {
            ...firstNode,
            label: '这是一个超过二十个中文字符的超长节点标签测试文本',
        },
    }    // 构造非法长标签操作

    const longLabelResult = graphStore.applyOperation(longLabelOperation)    // 执行非法长标签操作

    console.log('非法长标签结果：', longLabelResult)    // 应该 valid = false

    const selfLoopOperation: GraphOperation = {
        type: 'add_edge',
        edge: {
            ...firstEdge,
            id: 'test-self-loop-edge',
            source: firstNode.id,
            target: firstNode.id,
        },
    }    // 构造非法自环边操作

    const selfLoopResult = graphStore.applyOperation(selfLoopOperation)    // 执行非法自环边操作
    console.log('非法自环边结果：', selfLoopResult)    // 应该 valid = false
    
    const hasSelfLoopEdge = graphStore.currentGraph?.edges.some(edge => edge.id === 'test-self-loop-edge')    // 检查非法自环边是否被写入

    console.log('非法自环边是否被写入 currentGraph：', hasSelfLoopEdge)    // 应该是 false

    console.log('当前图所有边：', graphStore.currentGraph?.edges)    // 查看当前图里的边

    if (graphStore.currentGraph) {
        const fullResult = GraphValidator.validateGraph(graphStore.currentGraph)    // 执行全图校验

        console.log('全图校验结果：', fullResult)    // 输出全图校验结果
    }
}
