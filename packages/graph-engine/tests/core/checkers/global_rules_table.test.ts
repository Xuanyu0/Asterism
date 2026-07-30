/**
 * global_rules_table.test.ts
 *
 * 全局规则表与全局规则函数测试。
 */

import { describe, it, expect } from 'vitest'
import type { GraphData, GraphId, NodeId } from '../../../src/types/graph_data'
import {
    DEFAULT_GLOBAL_RULES_TABLE,
    GLOBAL_RULES,
    runGlobalRules,
    validateSelfLoops,
    validateDuplicateEdges,
    validateRealDirectedCycle,
    validateNodeCountSoftLimit,
    validateNodeCountWarningLimit,
    validateNodeCountHardLimit,
} from '../../../src/core/validators/global_rules'
import { createNode, createEdge, assembleGraph } from '../../test_case_factory'

const G = 'test-grt' as GraphId

function makeBase(): GraphData {
    return assembleGraph({ id: G, nodes: [
        createNode({ id: 'n0' as NodeId, graphId: G }),
        createNode({ id: 'n1' as NodeId, graphId: G }),
    ], edges: [] })
}

describe('global rules table', () => {
    it('DEFAULT_GLOBAL_RULES_TABLE 所有规则默认开启', () => {
        for (const rule of GLOBAL_RULES) {
            expect(DEFAULT_GLOBAL_RULES_TABLE[rule.code]).toBe(true)
        }
    })

    it('GLOBAL_RULES 中每个规则都有对应默认开关', () => {
        for (const rule of GLOBAL_RULES) {
            expect(typeof DEFAULT_GLOBAL_RULES_TABLE[rule.code]).toBe('boolean')
        }
    })

    it('runGlobalRules 默认执行全部规则', () => {
        const graph = makeBase()
        const issues = runGlobalRules(graph)
        expect(issues.length).toBe(0)
    })

    it('runGlobalRules 可关闭指定规则', () => {
        const graph = makeBase()
        graph.edges.push(createEdge({
            id: 'e-self' as NodeId,
            graphId: G,
            source: 'n0' as NodeId,
            target: 'n0' as NodeId,
            kind: 'real',
            direction: 'directed',
        }))

        const issuesWithRule = runGlobalRules(graph)
        expect(issuesWithRule.some(i => i.code === 'SELF_LOOP_FORBIDDEN')).toBe(true)

        const issuesWithoutRule = runGlobalRules(graph, { SELF_LOOP_FORBIDDEN: false })
        expect(issuesWithoutRule.some(i => i.code === 'SELF_LOOP_FORBIDDEN')).toBe(false)
    })
})

describe('validateSelfLoops', () => {
    it('检测自环', () => {
        const graph = makeBase()
        graph.edges.push(createEdge({
            id: 'e-self' as NodeId,
            graphId: G,
            source: 'n0' as NodeId,
            target: 'n0' as NodeId,
            kind: 'real',
            direction: 'directed',
        }))

        const issues = validateSelfLoops(graph)
        expect(issues.length).toBe(1)
        expect(issues[0]?.code).toBe('SELF_LOOP_FORBIDDEN')
    })

    it('无自环返回空', () => {
        const graph = makeBase()
        const issues = validateSelfLoops(graph)
        expect(issues.length).toBe(0)
    })
})

describe('validateDuplicateEdges', () => {
    it('检测重边', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
            createEdge({ id: 'e1' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
        )

        const issues = validateDuplicateEdges(graph)
        expect(issues.length).toBeGreaterThan(0)
        expect(issues.some(i => i.code === 'DUPLICATE_EDGE_FORBIDDEN')).toBe(true)
    })

    it('反向边也视为重边', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
            createEdge({ id: 'e1' as NodeId, graphId: G, source: 'n1' as NodeId, target: 'n0' as NodeId, kind: 'real', direction: 'directed' }),
        )

        const issues = validateDuplicateEdges(graph)
        expect(issues.some(i => i.code === 'DUPLICATE_EDGE_FORBIDDEN')).toBe(true)
    })
})

describe('validateRealDirectedCycle', () => {
    it('检测有向实边环', () => {
        // 手动构造含环图，绕过 assembleGraph 的 validateGraph 自检
        const graph: GraphData = {
            id: G,
            kind: 'root',
            title: G,
            nodes: [
                createNode({ id: 'n0' as NodeId, graphId: G }),
                createNode({ id: 'n1' as NodeId, graphId: G }),
                createNode({ id: 'n2' as NodeId, graphId: G }),
            ],
            edges: [
                createEdge({ id: 'e0' as NodeId, graphId: G, source: 'n0' as NodeId, target: 'n1' as NodeId, kind: 'real', direction: 'directed' }),
                createEdge({ id: 'e1' as NodeId, graphId: G, source: 'n1' as NodeId, target: 'n2' as NodeId, kind: 'real', direction: 'directed' }),
                createEdge({ id: 'e2' as NodeId, graphId: G, source: 'n2' as NodeId, target: 'n0' as NodeId, kind: 'real', direction: 'directed' }),
            ],
        }

        const issues = validateRealDirectedCycle(graph)
        expect(issues.length).toBe(1)
        expect(issues[0]?.code).toBe('REAL_DIRECTED_CYCLE_FORBIDDEN')
    })

    it('DAG 无环', () => {
        const graph = makeBase()
        graph.edges.push(createEdge({
            id: 'e0' as NodeId,
            graphId: G,
            source: 'n0' as NodeId,
            target: 'n1' as NodeId,
            kind: 'real',
            direction: 'directed',
        }))

        const issues = validateRealDirectedCycle(graph)
        expect(issues.length).toBe(0)
    })
})

describe('validateNodeCountLimits', () => {
    function makeGraphWithNodeCount(count: number): GraphData {
        const nodes = []
        for (let i = 0; i < count; i++) {
            nodes.push(createNode({ id: `n${i}` as NodeId, graphId: G }))
        }

        return {
            id: G,
            kind: 'root',
            title: G,
            nodes,
            edges: [],
        }
    }

    it('节点数在限制内返回空', () => {
        const graph = makeGraphWithNodeCount(2)
        expect(validateNodeCountSoftLimit(graph).length).toBe(0)
        expect(validateNodeCountWarningLimit(graph).length).toBe(0)
        expect(validateNodeCountHardLimit(graph).length).toBe(0)
    })

    it('超过软限制只返回 soft issue', () => {
        const graph = makeGraphWithNodeCount(51)
        expect(validateNodeCountSoftLimit(graph).length).toBe(1)
        expect(validateNodeCountWarningLimit(graph).length).toBe(0)
        expect(validateNodeCountHardLimit(graph).length).toBe(0)
    })

    it('超过警告限制只返回 warning issue', () => {
        const graph = makeGraphWithNodeCount(101)
        expect(validateNodeCountSoftLimit(graph).length).toBe(0)
        expect(validateNodeCountWarningLimit(graph).length).toBe(1)
        expect(validateNodeCountHardLimit(graph).length).toBe(0)
    })

    it('超过硬限制只返回 hard issue', () => {
        const graph = makeGraphWithNodeCount(151)
        expect(validateNodeCountSoftLimit(graph).length).toBe(0)
        expect(validateNodeCountWarningLimit(graph).length).toBe(0)
        expect(validateNodeCountHardLimit(graph).length).toBe(1)
    })

    it('runGlobalRules 不重复报告节点数问题', () => {
        const graph = makeGraphWithNodeCount(151)
        const issues = runGlobalRules(graph)
        const softCount = issues.filter(i => i.code === 'NODE_COUNT_SOFT_LIMIT_EXCEEDED').length
        const warningCount = issues.filter(i => i.code === 'NODE_COUNT_WARNING_LIMIT_EXCEEDED').length
        const hardCount = issues.filter(i => i.code === 'NODE_COUNT_HARD_LIMIT_EXCEEDED').length
        expect(softCount).toBe(0)
        expect(warningCount).toBe(0)
        expect(hardCount).toBe(1)
    })
})
