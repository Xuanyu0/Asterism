/**
 * internalize.test.ts
 *
 * 内化操作测试。覆盖原子/抽象/引用/混合四种节点类型。
 */

import type { GraphId, NodeId } from '../../../src/types/graph_data'
import { internalize } from '../../../src/compose/cognitive/internalize'
import {
    createInternalizeInputGraph,
    createInternalizeAbstractInputGraph,
    createCommonLayerGraph,
    createNode,
    assembleGraph,
} from '../../test_case_factory'

const R = new Map()

describe('internalize', () => {
    test('混合输入（知识节点迁移 + 引用节点自动删除）', () => {
        const graph = createInternalizeInputGraph()
        const common = createCommonLayerGraph()
        const result = internalize({
            nodeIds: ['int-K1', 'int-K2', 'int-Ref'] as NodeId[],
            parentGraph: graph,
            commonLayer: common,
            lookupGraph: () => undefined,
            nodeRadiusOverrides: R,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 父图 ops 含 delete_node（知识节点和引用节点）
        expect(
            result.operations.parent.some((op) => op.type === 'delete_node'),
        ).toBe(true)
        // 常识层 ops 含 add_node（只含知识节点）
        expect(
            result.operations.commonLayer.filter((op) => op.type === 'add_node')
                .length,
        ).toBe(2) // K1, K2
    })

    test('纯引用节点（全部自动删除）', () => {
        const graph = assembleGraph({
            id: 'test-int-ref' as GraphId,
            nodes: [
                createNode({
                    id: 'r1' as NodeId,
                    graphId: 'test-int-ref' as GraphId,
                    role: 'reference',
                    referenceKind: 'heuristic',
                    sourceGraphId: 'g' as GraphId,
                    sourceNodeId: 's' as NodeId,
                }),
                createNode({
                    id: 'r2' as NodeId,
                    graphId: 'test-int-ref' as GraphId,
                    role: 'reference',
                    referenceKind: 'communication',
                    sourceGraphId: 'g' as GraphId,
                    sourceNodeId: 's2' as NodeId,
                }),
            ],
            edges: [],
        })
        const common = createCommonLayerGraph()
        const result = internalize({
            nodeIds: ['r1', 'r2'] as NodeId[],
            parentGraph: graph,
            commonLayer: common,
            lookupGraph: () => undefined,
            nodeRadiusOverrides: R,
        })
        // 全为引用节点 → error
        expect(result.issues.some((i) => i.severity === 'error')).toBe(true)
        expect(
            result.operations.commonLayer.filter(
                (op) => op.type === 'add_node',
            ),
        ).toHaveLength(0)
    })

    test('抽象节点内化（含子图 DFS）', () => {
        const graph = createInternalizeAbstractInputGraph()
        const common = createCommonLayerGraph()
        const result = internalize({
            nodeIds: ['int-abs' as NodeId],
            parentGraph: graph,
            commonLayer: common,
            lookupGraph: () => undefined,
            nodeRadiusOverrides: R,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        // 有 warning 提示沟通节点将被删除
        expect(result.issues.some((i) => i.severity === 'warning')).toBe(true)
    })

    test('常识层位置散布（scatterInCircle 递增）', () => {
        const graph = assembleGraph({
            id: 'test-int-sct' as GraphId,
            nodes: [
                createNode({
                    id: 'k1' as NodeId,
                    graphId: 'test-int-sct' as GraphId,
                }),
                createNode({
                    id: 'k2' as NodeId,
                    graphId: 'test-int-sct' as GraphId,
                }),
                createNode({
                    id: 'k3' as NodeId,
                    graphId: 'test-int-sct' as GraphId,
                }),
            ],
            edges: [],
        })
        const common = createCommonLayerGraph()
        const result = internalize({
            nodeIds: ['k1', 'k2', 'k3'] as NodeId[],
            parentGraph: graph,
            commonLayer: common,
            lookupGraph: () => undefined,
            nodeRadiusOverrides: R,
        })
        expect(
            result.issues.filter((i) => i.severity === 'error'),
        ).toHaveLength(0)
        expect(
            result.operations.commonLayer.filter(
                (op) => op.type === 'add_node',
            ),
        ).toHaveLength(3)
        // position 各不相同（不碰撞）
        const positions = result.operations.commonLayer
            .filter((op) => op.type === 'add_node')
            .map((op: any) => op.node.position as { x: number; y: number })
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                expect(positions[i]).not.toEqual(positions[j])
            }
        }
    })
})
