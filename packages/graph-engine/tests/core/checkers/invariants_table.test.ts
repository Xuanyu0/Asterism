/**
 * 不变量规则表与规则函数测试：偏好开关表语义 + 硬性恒跑不可关。
 */

import type { GraphData, GraphId, NodeId } from '../../../src/types/graph_data'
import { DEFAULT_PREFERENCE_TABLE } from '../../../src/core/rules/invariants/preference_rules_table'
import {
    PREFERENCE_RULES,
    validateNodeCountSoftLimit,
    validateNodeCountWarningLimit,
    validateNodeCountHardLimit,
} from '../../../src/core/rules/invariants/preferences'
import {
    STRUCTURAL_RULES,
    validateSelfLoops,
    validateDuplicateEdges,
    validateRealDirectedCycle,
    validateEdgeSourceExists,
    validateEdgeTargetExists,
} from '../../../src/core/rules/invariants/structural'
import { checkInvariants } from '../../../src/core/rules/invariants/check_invariants'
import { createNode, createEdge, assembleGraph } from '../../test_case_factory'

const G = 'test-grt' as GraphId

function makeBase(): GraphData {
    return assembleGraph({
        id: G,
        nodes: [createNode({ id: 'n0' as NodeId, graphId: G }), createNode({ id: 'n1' as NodeId, graphId: G })],
        edges: [],
    })
}

// 单条 source 悬空边 + 单条 target 悬空边的图（各自独立成边）
function makeDanglingEdgeGraph(): GraphData {
    return {
        id: G,
        kind: 'root',
        title: G,
        nodes: [createNode({ id: 'n0' as NodeId, graphId: G })],
        cognitiveState: { foldedDependencies: [] },
        edges: [
            createEdge({
                id: 'e-source-missing' as NodeId,
                graphId: G,
                source: 'n-x' as NodeId,
                target: 'n0' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
            createEdge({
                id: 'e-target-missing' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n-y' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        ],
    }
}

describe('preference table（偏好开关表语义）', () => {
    test('DEFAULT_PREFERENCE_TABLE 覆盖全部偏好规则（默认开启）', () => {
        for (const rule of PREFERENCE_RULES) {
            expect(DEFAULT_PREFERENCE_TABLE[rule.code]).toBe(true)
        }
    })

    test('DEFAULT_PREFERENCE_TABLE 不含硬性规则 code（硬性缺席配置面）', () => {
        for (const rule of STRUCTURAL_RULES) {
            expect(DEFAULT_PREFERENCE_TABLE[rule.code]).toBeUndefined()
        }
    })

    test('checkInvariants 默认执行全部规则（基线图零 issue）', () => {
        const graph = makeBase()
        const issues = checkInvariants(graph)
        expect(issues.length).toBe(0)
    })

    test('checkInvariants 可关闭偏好规则（NODE_LABEL_TOO_LONG）', () => {
        const graph = makeBase()
        graph.nodes[0]!.label = 'x'.repeat(21)

        const issuesWithRule = checkInvariants(graph)
        expect(issuesWithRule.some((i) => i.code === 'NODE_LABEL_TOO_LONG')).toBe(true)

        const issuesWithoutRule = checkInvariants(graph, {
            NODE_LABEL_TOO_LONG: false,
        })
        expect(issuesWithoutRule.some((i) => i.code === 'NODE_LABEL_TOO_LONG')).toBe(false)
    })

    test('checkInvariants 硬性规则不可关（传 SELF_LOOP_FORBIDDEN: false 仍检出自环）', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({
                id: 'e-self' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n0' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        )

        const issues = checkInvariants(graph, {
            SELF_LOOP_FORBIDDEN: false,
        })
        expect(issues.some((i) => i.code === 'SELF_LOOP_FORBIDDEN')).toBe(true)
    })
})

describe('validateSelfLoops', () => {
    test('检测自环', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({
                id: 'e-self' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n0' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        )

        const issues = validateSelfLoops(graph)
        expect(issues.length).toBe(1)
        expect(issues[0]?.code).toBe('SELF_LOOP_FORBIDDEN')
    })

    test('无自环返回空', () => {
        const graph = makeBase()
        const issues = validateSelfLoops(graph)
        expect(issues.length).toBe(0)
    })
})

describe('validateDuplicateEdges', () => {
    test('检测重边', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({
                id: 'e0' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n1' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
            createEdge({
                id: 'e1' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n1' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        )

        const issues = validateDuplicateEdges(graph)
        expect(issues.length).toBeGreaterThan(0)
        expect(issues.some((i) => i.code === 'DUPLICATE_EDGE_FORBIDDEN')).toBe(true)
    })

    test('反向边也视为重边', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({
                id: 'e0' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n1' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
            createEdge({
                id: 'e1' as NodeId,
                graphId: G,
                source: 'n1' as NodeId,
                target: 'n0' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        )

        const issues = validateDuplicateEdges(graph)
        expect(issues.some((i) => i.code === 'DUPLICATE_EDGE_FORBIDDEN')).toBe(true)
    })
})

describe('validateRealDirectedCycle', () => {
    test('检测有向实边环', () => {
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
            cognitiveState: { foldedDependencies: [] },
            edges: [
                createEdge({
                    id: 'e0' as NodeId,
                    graphId: G,
                    source: 'n0' as NodeId,
                    target: 'n1' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
                createEdge({
                    id: 'e1' as NodeId,
                    graphId: G,
                    source: 'n1' as NodeId,
                    target: 'n2' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
                createEdge({
                    id: 'e2' as NodeId,
                    graphId: G,
                    source: 'n2' as NodeId,
                    target: 'n0' as NodeId,
                    kind: 'real',
                    direction: 'directed',
                }),
            ],
        }

        const issues = validateRealDirectedCycle(graph)
        expect(issues.length).toBe(1)
        expect(issues[0]?.code).toBe('REAL_DIRECTED_CYCLE_FORBIDDEN')
    })

    test('DAG 无环', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({
                id: 'e0' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n1' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        )

        const issues = validateRealDirectedCycle(graph)
        expect(issues.length).toBe(0)
    })
})

// ═══════════ EDGE 端点存在性（悬空边）═══

describe('validateEdgeSourceExists / validateEdgeTargetExists', () => {
    test('单侧 check 各只报自己侧别（source 与 target 恰好各 1 条）', () => {
        const graph = makeDanglingEdgeGraph()

        const sourceIssues = validateEdgeSourceExists(graph)
        expect(sourceIssues).toHaveLength(1)
        expect(sourceIssues[0]).toMatchObject({
            severity: 'error',
            code: 'EDGE_SOURCE_NOT_FOUND',
            targetId: 'e-source-missing',
        })

        const targetIssues = validateEdgeTargetExists(graph)
        expect(targetIssues).toHaveLength(1)
        expect(targetIssues[0]).toMatchObject({
            severity: 'error',
            code: 'EDGE_TARGET_NOT_FOUND',
            targetId: 'e-target-missing',
        })
    })

    test('checkInvariants 输出中两 code 各恰好 1 条（注册表 code ↔ check 1:1，不重复上报）', () => {
        const graph = makeDanglingEdgeGraph()

        const issues = checkInvariants(graph)
        expect(issues.filter((i) => i.code === 'EDGE_SOURCE_NOT_FOUND')).toHaveLength(1)
        expect(issues.filter((i) => i.code === 'EDGE_TARGET_NOT_FOUND')).toHaveLength(1)
        expect(issues.every((i) => i.severity === 'error')).toBe(true)
    })

    test('无悬空边返回空', () => {
        const graph = makeBase()
        expect(validateEdgeSourceExists(graph)).toHaveLength(0)
        expect(validateEdgeTargetExists(graph)).toHaveLength(0)
    })

    test('checkInvariants 默认检出悬空边（硬性恒跑）', () => {
        const graph = makeBase()
        graph.edges.push(
            createEdge({
                id: 'e-x' as NodeId,
                graphId: G,
                source: 'n0' as NodeId,
                target: 'n-missing' as NodeId,
                kind: 'real',
                direction: 'directed',
            }),
        )

        const issues = checkInvariants(graph)
        expect(issues.filter((i) => i.code === 'EDGE_TARGET_NOT_FOUND')).toHaveLength(1)
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
            cognitiveState: { foldedDependencies: [] },
        }
    }

    test('节点数在限制内返回空', () => {
        const graph = makeGraphWithNodeCount(2)
        expect(validateNodeCountSoftLimit(graph).length).toBe(0)
        expect(validateNodeCountWarningLimit(graph).length).toBe(0)
        expect(validateNodeCountHardLimit(graph).length).toBe(0)
    })

    test('超过软限制只返回 soft issue', () => {
        const graph = makeGraphWithNodeCount(51)
        expect(validateNodeCountSoftLimit(graph).length).toBe(1)
        expect(validateNodeCountWarningLimit(graph).length).toBe(0)
        expect(validateNodeCountHardLimit(graph).length).toBe(0)
    })

    test('超过警告限制只返回 warning issue', () => {
        const graph = makeGraphWithNodeCount(101)
        expect(validateNodeCountSoftLimit(graph).length).toBe(0)
        expect(validateNodeCountWarningLimit(graph).length).toBe(1)
        expect(validateNodeCountHardLimit(graph).length).toBe(0)
    })

    test('超过硬限制只返回 hard issue', () => {
        const graph = makeGraphWithNodeCount(151)
        expect(validateNodeCountSoftLimit(graph).length).toBe(0)
        expect(validateNodeCountWarningLimit(graph).length).toBe(0)
        expect(validateNodeCountHardLimit(graph).length).toBe(1)
    })

    test('checkInvariants 不重复报告节点数问题', () => {
        const graph = makeGraphWithNodeCount(151)
        const issues = checkInvariants(graph)
        const softCount = issues.filter((i) => i.code === 'NODE_COUNT_SOFT_LIMIT_EXCEEDED').length
        const warningCount = issues.filter((i) => i.code === 'NODE_COUNT_WARNING_LIMIT_EXCEEDED').length
        const hardCount = issues.filter((i) => i.code === 'NODE_COUNT_HARD_LIMIT_EXCEEDED').length
        expect(softCount).toBe(0)
        expect(warningCount).toBe(0)
        expect(hardCount).toBe(1)
    })
})
