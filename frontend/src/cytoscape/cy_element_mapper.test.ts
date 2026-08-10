/**
 * 说明：
 *
 *     cy_element_mapper 的单元测试。
 *     覆盖：节点 position 必须【拷贝值】而非传引用（Cytoscape 会按引用存储并
 *     在 cy.json 更新时原地写回——move 预览污染 GraphData 的回归防护）、
 *     无 position 节点映射为 undefined、折叠过滤后目标节点不进入渲染结果。
 */

import { createNode } from '@/dev/test_case_factory'
import { mapGraphDataToCyElements } from './cy_element_mapper'

import type { GraphData, GraphId, NodeId } from '@my-project/graph-engine'

const GRAPH_ID = 'graph-root-1' as GraphId

function buildGraph(nodes: ReturnType<typeof createNode>[]): GraphData {
    return {
        id: GRAPH_ID,
        kind: 'root',
        title: 'mapper test',
        nodes,
        edges: [],
        cognitiveState: { foldedDependencies: [] },
    }
}

describe('mapGraphDataToCyElements', () => {
    test('节点 position 是拷贝而非引用——修改渲染结果不污染源图', () => {
        const node = createNode({
            id: 'node-a' as NodeId,
            graphId: GRAPH_ID,
            position: { x: 100, y: 200 },
        })
        const graph = buildGraph([node])

        const elements = mapGraphDataToCyElements(graph)
        const cyNode = elements.nodes[0]!

        // Cytoscape 构造 Element 时按引用存 position，cy.json 更新会原地写回该对象。
        // mapper 若直接传 node.position（graphView 场景下是 Vue reactive Proxy），
        // 预览 sync 就会把预览位置写穿回 graphStore.graphView。此处验证隔离。
        cyNode.position!.x = 999
        cyNode.position!.y = 888

        expect(node.position).toEqual({ x: 100, y: 200 })
        expect(graph.nodes[0]!.position).toEqual({ x: 100, y: 200 })
    })

    test('position 值正确透传', () => {
        const node = createNode({
            id: 'node-a' as NodeId,
            graphId: GRAPH_ID,
            position: { x: 350, y: -120 },
        })

        const elements = mapGraphDataToCyElements(buildGraph([node]))

        expect(elements.nodes[0]!.position).toEqual({ x: 350, y: -120 })
    })

    test('节点无 position 时映射为 undefined', () => {
        const node = createNode({
            id: 'node-a' as NodeId,
            graphId: GRAPH_ID,
        })

        const elements = mapGraphDataToCyElements(buildGraph([node]))

        expect(elements.nodes[0]!.position).toBeUndefined()
    })

    test('折叠隐藏的节点不进入渲染结果', () => {
        const parent = createNode({
            id: 'node-parent' as NodeId,
            graphId: GRAPH_ID,
            position: { x: 0, y: 0 },
        })
        const child = createNode({
            id: 'node-child' as NodeId,
            graphId: GRAPH_ID,
            position: { x: 10, y: 10 },
            childGraphId: 'graph-sub-1' as GraphId,
        })
        const graph = buildGraph([parent, child])
        graph.cognitiveState = {
            foldedDependencies: [
                {
                    targetNodeId: 'node-parent' as NodeId,
                    foldedNodeIds: ['node-child' as NodeId],
                },
            ],
        }

        const elements = mapGraphDataToCyElements(graph)

        expect(elements.nodes.map((n) => n.data.id)).not.toContain('node-child')
        expect(elements.nodes.map((n) => n.data.id)).toContain('node-parent')
    })
})
