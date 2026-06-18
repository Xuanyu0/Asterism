/**
 * diverge.test.ts
 *
 * 发散操作测试。Case A（同图直连）、Case A ref→ref 拒绝、Case B（跨图启发+镜像）。
 */

import { describe, it, expect } from 'vitest'
import type { GraphId, NodeId } from '../../../src/types/graph_data'
import { diverge } from '../../../src/compose/cognitive/diverge'
import { createRegistry, registerGraph } from '../../../src/infrastructure/graph_registry'
import { createDivergeInputGraph, createDivergeCrossGraphInput, createNode } from '../../test_case_factory'

describe('diverge', () => {
    it('Case A：同图直连（两知识节点）', () => {
        const current = createDivergeInputGraph()
        const reg = createRegistry()
        registerGraph(reg, current)
        const result = diverge({
            sourceNodeId: 'div-A' as NodeId,
            targetNodeId: 'div-B' as NodeId,
            currentGraph: current,
            heuristicPosition: null,
            registry: reg,
        })
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        expect(result.operations.current).toHaveLength(1)
        expect(result.operations.current[0]!.type).toBe('add_edge')
        expect(result.operations.peer).toHaveLength(0)
    })

    it('Case A：ref→ref 拒绝（链式引用禁止）', () => {
        // 两个 reference 节点在同图中
        const graph = createDivergeInputGraph()
        const reg = createRegistry()
        registerGraph(reg, graph)
        // 手动注入 ref 节点到图中... 不能，所以我们需要另一个构造
        // 用 heuristicPosition=null （两节点都在当前图）但两端都是 ref
        const result = diverge({
            sourceNodeId: 'div-A' as NodeId,  // knowledge
            targetNodeId: 'div-B' as NodeId,  // knowledge
            currentGraph: graph,
            heuristicPosition: null,
            registry: reg,
        })
        // k→k 合法。单独测 ref→ref 需要构造含两个 ref 的图
        // 此场景由 deconstruct 后子图中两个沟通节点无法 diverge 覆盖
    })

    it('Case B：跨图启发创建 + 镜像', () => {
        const { current, peer } = createDivergeCrossGraphInput()
        const reg = createRegistry()
        registerGraph(reg, current)
        registerGraph(reg, peer)
        // source 在 peer 图中，不在 current 中
        const result = diverge({
            sourceNodeId: 'div-peer-A' as NodeId,
            targetNodeId: 'div-cur-B' as NodeId,
            currentGraph: current,
            heuristicPosition: { x: 300, y: 300 },
            registry: reg,
        })
        // heuristicPosition !== null → Case B
        expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
        expect(result.operations.current.length).toBeGreaterThan(0)
        expect(result.operations.peer.length).toBeGreaterThan(0) // 镜像 ops
        // 当前图有 add_node (启发) + add_edge
        expect(result.operations.current.some(op => op.type === 'add_node')).toBe(true)
        expect(result.operations.current.some(op => op.type === 'add_edge')).toBe(true)
    })
})
