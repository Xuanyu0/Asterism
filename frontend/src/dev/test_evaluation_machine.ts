/**
 * test_evaluation_machine.ts
 *
 * 功能：
 *     Phase 1 自动化验收测试机。通过程序化调用 Graph Runtime 和 UI Runtime 的公开 API，
 *     验证数据层正确性。所有测试不依赖 Cytoscape 渲染，不检查视觉样式。
 *
 * 总体结构：
 *     1. 测试数据完整性 — 所有工厂函数产出合法 GraphData
 *     2. 图操作执行器 — applyOperationToGraph 纯函数正确性
 *     3. 折叠/展开 — cognitiveState 正确性
 *     4. 操作校验器 — OperationValidator 规则拦截
 *     5. 撤销栈 — pushUndoSnapshot / undoDelete
 *     6. 持久化 — localStorage 往返
 *     7. Graph Store 集成 — store.applyOperation 全链路
 *
 * 自动化覆盖率：
 *     覆盖清单中全部数据层测试（约 70%）。视觉样式、动画、DOM 交互仍需手动。
 *
 * 外部如何使用：
 *     main.ts 中调用 registerTestMachine() → 浏览器控制台输入 window.runAllTests()
 */

import type { EdgeData, EdgeId, GraphData, GraphId, NodeData, NodeId } from '@my-project/graph-engine'
import type { GraphOperation } from '@my-project/graph-engine'
import type { ValidationResult } from '@my-project/graph-engine'

import { GraphValidator } from '@/definitions/validators/graph_validator'
import { OperationValidator } from '@/definitions/validators/operation_validator'

import { applyOperationToGraph, pushUndoSnapshot, shouldPushUndoSnapshot } from '@/graph/utilities/operation_executor'
import { saveGraph, loadGraph, deleteGraph } from '@/graph/utilities/graph_persistence'

import { useGraphStore } from '@/graph/graph_store'

import {
    createGoldenTestGraph,
    createChainDAG,
    createEdgeMatrixGraph,
    createVirtualNodeTestGraph,
    createAbstractNodeTestGraph,
    createCommunicationTestGraph,
    createDeleteUndoTestGraph,
    createNode,
    createEdge,
    assembleGraph,
} from '@/mock/test_case_factory'

// ═══════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════

interface TestResult {
    name: string
    passed: boolean
    detail?: string
}

interface TestSuite {
    name: string
    tests: TestResult[]
    get passed(): number
    get failed(): number
}

// ═══════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════

const G = 'test-eval' as GraphId

function suite(name: string, tests: TestResult[]): TestSuite {
    return {
        name,
        tests,
        get passed() { return tests.filter(t => t.passed).length },
        get failed() { return tests.filter(t => !t.passed).length },
    }
}

function logSuite(s: TestSuite): void {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`  ${s.name}  [${s.passed}/${s.tests.length} 通过]`)
    console.log(`${'='.repeat(60)}`)
    for (const t of s.tests) {
        const marker = t.passed ? '✅' : '❌'
        const detail = t.detail ? `  → ${t.detail}` : ''
        console.log(`  ${marker} ${t.name}${detail}`)
    }
}

/**
 * 功能：
 *     快速创建简单测试用图（2 个实节点）。
 */
function makeTwoNodeGraph(): GraphData {
    return assembleGraph({
        id: G,
        title: '两节点测试图',
        nodes: [
            createNode({ id: 'a' as NodeId, graphId: G, kind: 'real', label: '节点A', position: { x: 0, y: 0 } }),
            createNode({ id: 'b' as NodeId, graphId: G, kind: 'real', label: '节点B', position: { x: 300, y: 0 } }),
        ],
        edges: [],
    })
}

/**
 * 功能：
 *     创建单节点测试图（用于删除测试）。
 */
function makeSingleNodeGraph(): GraphData {
    return assembleGraph({
        id: G,
        title: '单节点测试图',
        nodes: [
            createNode({ id: 'only' as NodeId, graphId: G, kind: 'real', label: '唯一节点' }),
        ],
        edges: [],
    })
}

// ═══════════════════════════════════════════════════════════════════
// Suite 1: 测试数据完整性
// ═══════════════════════════════════════════════════════════════════

function testFactoryDataIntegrity(): TestSuite {
    const results: TestResult[] = []

    const factories: [string, () => GraphData][] = [
        ['chainDAG(3)', () => createChainDAG(3, G)],
        ['chainDAG(8)', () => createChainDAG(8, G)],
        ['edgeMatrix', () => createEdgeMatrixGraph(G)],
        ['virtualNode', () => createVirtualNodeTestGraph(G)],
        ['abstractNode', () => createAbstractNodeTestGraph(G)],
        ['communication', () => createCommunicationTestGraph(G)],
        ['deleteUndo', () => createDeleteUndoTestGraph(G)],
        ['golden', () => createGoldenTestGraph(G)],
    ]

    for (const [name, factory] of factories) {
        const result = GraphValidator.validateGraph(factory())
        results.push({
            name,
            passed: result.valid,
            detail: result.valid ? undefined : result.issues.map(i => i.message).join('; '),
        })
    }

    return suite('测试数据完整性', results)
}

// ═══════════════════════════════════════════════════════════════════
// Suite 2: 图操作执行器
// ═══════════════════════════════════════════════════════════════════

function testOperationExecutor(): TestSuite {
    const results: TestResult[] = []

    // --- add_node ---
    {
        const graph = makeTwoNodeGraph()
        const newNode: NodeData = {
            role: 'knowledge',
            id: 'c' as NodeId,
            graphId: G,
            kind: 'real',
            form: 'atomic',
            label: '节点C',
            summary: '',
            abstractionLevel: 0,
            degree: 0,
            position: { x: 600, y: 0 },
        }
        const next = applyOperationToGraph(graph, { type: 'add_node', node: newNode })

        results.push({
            name: 'add_node 节点数 +1',
            passed: next.nodes.length === graph.nodes.length + 1,
            detail: `期望 ${graph.nodes.length + 1}, 实际 ${next.nodes.length}`,
        })
        results.push({
            name: 'add_node 新节点存在且数据完整',
            passed: (() => {
                const found = next.nodes.find(node => n.id === 'c')
                return !!found && found.label === '节点C' && found.position?.x === 600
            })(),
        })
    }

    // --- add_edge ---
    {
        const graph = makeTwoNodeGraph()
        const edge: EdgeData = {
            id: 'a-b' as EdgeId,
            graphId: G,
            source: 'a' as NodeId,
            target: 'b' as NodeId,
            kind: 'real',
            direction: 'directed',
            label: '边',
        }
        const next = applyOperationToGraph(graph, { type: 'add_edge', edge })

        results.push({
            name: 'add_edge 边数 +1',
            passed: next.edges.length === graph.edges.length + 1,
            detail: `期望 ${graph.edges.length + 1}, 实际 ${next.edges.length}`,
        })
        results.push({
            name: 'add_edge 两端 degree +1',
            passed: (() => {
                const a = next.nodes.find(node => n.id === 'a')
                const b = next.nodes.find(node => n.id === 'b')
                return a!.degree === 1 && b!.degree === 1
            })(),
            detail: `a.degree=${next.nodes.find(node => n.id === 'a')!.degree}, b.degree=${next.nodes.find(node => n.id === 'b')!.degree}`,
        })
    }

    // --- delete_node ---
    {
        const graph = makeTwoNodeGraph()
        const next = applyOperationToGraph(graph, { type: 'delete_node', nodeId: 'a' as NodeId })

        results.push({
            name: 'delete_node 节点数 -1',
            passed: next.nodes.length === graph.nodes.length - 1,
            detail: `期望 ${graph.nodes.length - 1}, 实际 ${next.nodes.length}`,
        })
        results.push({
            name: 'delete_node 被删节点不存在于结果中',
            passed: !next.nodes.find(node => n.id === 'a'),
        })
    }

    // --- delete_node cascade edges ---
    {
        const graph = makeTwoNodeGraph()
        const withEdge = applyOperationToGraph(graph, {
            type: 'add_edge',
            edge: {
                id: 'a-b' as EdgeId, graphId: G,
                source: 'a' as NodeId, target: 'b' as NodeId,
                kind: 'real', direction: 'directed',
                label: '',
            },
        })
        const next = applyOperationToGraph(withEdge, { type: 'delete_node', nodeId: 'a' as NodeId })

        results.push({
            name: 'delete_node 级联删除关联边',
            passed: next.edges.length === 0,
            detail: `期望 0, 实际 ${next.edges.length}`,
        })
        results.push({
            name: 'delete_node 相邻节点 degree 减少',
            passed: next.nodes.find(node => n.id === 'b')!.degree === 0,
            detail: `b.degree=${next.nodes.find(node => n.id === 'b')!.degree}`,
        })
    }

    // --- delete_edge ---
    {
        const graph = makeTwoNodeGraph()
        const withEdge = applyOperationToGraph(graph, {
            type: 'add_edge',
            edge: {
                id: 'a-b' as EdgeId, graphId: G,
                source: 'a' as NodeId, target: 'b' as NodeId,
                kind: 'real', direction: 'directed',
                label: '',
            },
        })
        const next = applyOperationToGraph(withEdge, { type: 'delete_edge', edgeId: 'a-b' as EdgeId })

        results.push({
            name: 'delete_edge 边数 -1',
            passed: next.edges.length === 0,
            detail: `期望 0, 实际 ${next.edges.length}`,
        })
        results.push({
            name: 'delete_edge 两端 degree -1',
            passed: next.nodes.find(node => n.id === 'a')!.degree === 0
                && next.nodes.find(node => n.id === 'b')!.degree === 0,
        })
    }

    // --- update_node ---
    {
        const graph = makeTwoNodeGraph()
        const originalA = graph.nodes.find(node => n.id === 'a')!
        const updatedA = { ...originalA, label: '改过标签', summary: '新摘要' } as NodeData
        const next = applyOperationToGraph(graph, { type: 'update_node', node: updatedA })

        results.push({
            name: 'update_node 标签更新',
            passed: next.nodes.find(node => n.id === 'a')!.label === '改过标签',
        })
        results.push({
            name: 'update_node 摘要更新',
            passed: (next.nodes.find(node => n.id === 'a') as Extract<NodeData, { role: 'knowledge' }>).summary === '新摘要',
        })
        results.push({
            name: 'update_node 节点数不变',
            passed: next.nodes.length === graph.nodes.length,
        })
    }

    // --- update_edge ---
    {
        const graph = makeTwoNodeGraph()
        const withEdge = applyOperationToGraph(graph, {
            type: 'add_edge',
            edge: {
                id: 'a-b' as EdgeId, graphId: G,
                source: 'a' as NodeId, target: 'b' as NodeId,
                kind: 'real', direction: 'directed',
                label: '',
            },
        })
        const updatedEdge: EdgeData = {
            ...withEdge.edges[0]!,
            label: '新边标签',
        }
        const next = applyOperationToGraph(withEdge, { type: 'update_edge', edge: updatedEdge })

        results.push({
            name: 'update_edge 标签更新',
            passed: next.edges.find(edge => edge.id === 'a-b')!.label === '新边标签',
        })
    }

    // --- move_node ---
    {
        const graph = makeTwoNodeGraph()
        const next = applyOperationToGraph(graph, {
            type: 'move_node',
            nodeId: 'a' as NodeId,
            position: { x: 999, y: 888 },
        })

        results.push({
            name: 'move_node 位置更新',
            passed: (() => {
                const pos = next.nodes.find(node => n.id === 'a')!.position!
                return pos.x === 999 && pos.y === 888
            })(),
        })
    }

    // --- 纯函数性：不修改入参 ---
    {
        const graph = makeTwoNodeGraph()
        const snapshot = graph.nodes.length
        applyOperationToGraph(graph, { type: 'delete_node', nodeId: 'a' as NodeId })
        results.push({
            name: 'applyOperationToGraph 不修改入参 GraphData',
            passed: graph.nodes.length === snapshot,
            detail: `期望 ${snapshot}, 实际 ${graph.nodes.length}`,
        })
    }

    return suite('图操作执行器', results)
}

// ═══════════════════════════════════════════════════════════════════
// Suite 3: 折叠 / 展开
// ═══════════════════════════════════════════════════════════════════

function testFoldExpand(): TestSuite {
    const results: TestResult[] = []

    // --- collapse ---
    {
        const dag3 = createChainDAG(3, G)
        const next = applyOperationToGraph(dag3, {
            type: 'collapse_dependency',
            targetNodeId: 'chain-2' as NodeId,
        })

        results.push({
            name: 'collapse_dependency 写入 cognitiveState',
            passed: (next.cognitiveState?.foldedDependencies?.length ?? 0) > 0,
            detail: `foldedDependencies=${JSON.stringify(next.cognitiveState?.foldedDependencies)}`,
        })
        results.push({
            name: 'collapse_dependency 折叠正确的节点集合',
            passed: (() => {
                const folded = next.cognitiveState?.foldedDependencies?.find(
                    f => f.targetNodeId === 'chain-2',
                )
                return !!folded && folded.foldedNodeIds.includes('chain-0' as NodeId)
                    && folded.foldedNodeIds.includes('chain-1' as NodeId)
            })(),
        })
        results.push({
            name: 'collapse_dependency 不删除节点',
            passed: next.nodes.length === dag3.nodes.length,
            detail: `期望 ${dag3.nodes.length}, 实际 ${next.nodes.length}`,
        })
    }

    // --- expand ---
    {
        const dag3 = createChainDAG(3, G)
        const collapsed = applyOperationToGraph(dag3, {
            type: 'collapse_dependency',
            targetNodeId: 'chain-2' as NodeId,
        })
        const expanded = applyOperationToGraph(collapsed, {
            type: 'expand_dependency',
            targetNodeId: 'chain-2' as NodeId,
        })

        results.push({
            name: 'expand_dependency 清除折叠记录',
            passed: !expanded.cognitiveState?.foldedDependencies?.some(
                f => f.targetNodeId === 'chain-2',
            ),
        })
    }

    // --- fold on node with no deps ---
    {
        const dag3 = createChainDAG(3, G)
        const next = applyOperationToGraph(dag3, {
            type: 'collapse_dependency',
            targetNodeId: 'chain-0' as NodeId,
        })

        results.push({
            name: 'collapse 无前置依赖节点不改变图',
            passed: next === dag3,
        })
    }

    return suite('折叠 / 展开', results)
}

// ═══════════════════════════════════════════════════════════════════
// Suite 4: 操作校验器
// ═══════════════════════════════════════════════════════════════════

function testOperationValidator(): TestSuite {
    const results: TestResult[] = []

    function expectValid(label: string, graph: GraphData, op: GraphOperation): TestResult {
        const r = OperationValidator.validateOperation(graph, op)
        return {
            name: label,
            passed: r.valid,
            detail: r.valid ? undefined : r.issues.map(i => i.message).join('; '),
        }
    }

    function expectInvalid(label: string, graph: GraphData, op: GraphOperation): TestResult {
        const r = OperationValidator.validateOperation(graph, op)
        return {
            name: label,
            passed: !r.valid,
            detail: r.valid ? '应拒绝但通过了' : undefined,
        }
    }

    const testGraphId = 'test-validator' as GraphId

    // --- 正常操作应通过 ---
    {
        const graph = assembleGraph({
            id: testGraphId,
            title: '校验测试图',
            nodes: [
                createNode({ id: 'n1' as NodeId, graphId: testGraphId, kind: 'real', label: '节点1' }),
                createNode({ id: 'n2' as NodeId, graphId: testGraphId, kind: 'real', label: '节点2' }),
                createNode({ id: 'n3' as NodeId, graphId: testGraphId, kind: 'real', label: '节点3' }),
            ],
            edges: [],
        })

        results.push(expectValid('合法 add_node', graph, {
            type: 'add_node',
            node: createNode({ id: 'n4' as NodeId, graphId: testGraphId, kind: 'real', label: '新节点' }),
        }))

        results.push(expectValid('合法 add_edge (有向实边)', graph, {
            type: 'add_edge',
            edge: createEdge({
                id: 'e12' as EdgeId, graphId: testGraphId,
                source: 'n1' as NodeId, target: 'n2' as NodeId,
                kind: 'real', direction: 'directed',
            }),
        }))

        results.push(expectValid('合法 add_edge (无向虚边)', graph, {
            type: 'add_edge',
            edge: createEdge({
                id: 'e12-v' as EdgeId, graphId: testGraphId,
                source: 'n1' as NodeId, target: 'n2' as NodeId,
                kind: 'virtual', direction: 'undirected',
            }),
        }))
    }

    // --- 自环边被拒 ---
    {
        const graph = makeSingleNodeGraph()
        results.push(expectInvalid('自环边被拒', graph, {
            type: 'add_edge',
            edge: createEdge({
                id: 'self' as EdgeId, graphId: G,
                source: 'only' as NodeId, target: 'only' as NodeId,
                kind: 'real', direction: 'directed',
            }),
        }))
    }

    // --- 重边被拒 ---
    {
        const graph = assembleGraph({
            id: testGraphId,
            title: '重边测试',
            nodes: [
                createNode({ id: 'r1' as NodeId, graphId: testGraphId, kind: 'real', label: 'A' }),
                createNode({ id: 'r2' as NodeId, graphId: testGraphId, kind: 'real', label: 'B' }),
            ],
            edges: [
                createEdge({
                    id: 'existing' as EdgeId, graphId: testGraphId,
                    source: 'r1' as NodeId, target: 'r2' as NodeId,
                    kind: 'real', direction: 'directed',
                }),
            ],
        })

        results.push(expectInvalid('重边被拒 (同 source/target)', graph, {
            type: 'add_edge',
            edge: createEdge({
                id: 'dup' as EdgeId, graphId: testGraphId,
                source: 'r1' as NodeId, target: 'r2' as NodeId,
                kind: 'virtual', direction: 'undirected',
            }),
        }))
    }

    // --- 有向实边成环被拒 ---
    {
        const graph = assembleGraph({
            id: testGraphId,
            title: '环检测',
            nodes: [
                createNode({ id: 'c1' as NodeId, graphId: testGraphId, kind: 'real', label: 'A' }),
                createNode({ id: 'c2' as NodeId, graphId: testGraphId, kind: 'real', label: 'B' }),
                createNode({ id: 'c3' as NodeId, graphId: testGraphId, kind: 'real', label: 'C' }),
            ],
            edges: [
                createEdge({ id: 'c12' as EdgeId, graphId: testGraphId, source: 'c1' as NodeId, target: 'c2' as NodeId, kind: 'real', direction: 'directed' }),
                createEdge({ id: 'c23' as EdgeId, graphId: testGraphId, source: 'c2' as NodeId, target: 'c3' as NodeId, kind: 'real', direction: 'directed' }),
            ],
        })

        results.push(expectInvalid('有向实边成环被拒', graph, {
            type: 'add_edge',
            edge: createEdge({ id: 'c31' as EdgeId, graphId: testGraphId, source: 'c3' as NodeId, target: 'c1' as NodeId, kind: 'real', direction: 'directed' }),
        }))
    }

    // --- 虚节点只能连无向虚边 ---
    {
        const graph = assembleGraph({
            id: testGraphId,
            title: '虚节点测试',
            nodes: [
                createNode({ id: 'v1' as NodeId, graphId: testGraphId, kind: 'virtual', label: '虚节点' }),
                createNode({ id: 'r1' as NodeId, graphId: testGraphId, kind: 'real', label: '实节点' }),
            ],
            edges: [],
        })

        results.push(expectInvalid('虚节点连有向实边被拒', graph, {
            type: 'add_edge',
            edge: createEdge({ id: 'bad' as EdgeId, graphId: testGraphId, source: 'v1' as NodeId, target: 'r1' as NodeId, kind: 'real', direction: 'directed' }),
        }))
    }

    // --- 删除不存在的节点 ---
    {
        const graph = makeSingleNodeGraph()
        results.push(expectInvalid('delete_node 不存在被拒', graph, {
            type: 'delete_node',
            nodeId: 'ghost' as NodeId,
        }))
    }

    // --- 删除不存在的边 ---
    {
        const graph = makeSingleNodeGraph()
        results.push(expectInvalid('delete_edge 不存在被拒', graph, {
            type: 'delete_edge',
            edgeId: 'ghost' as EdgeId,
        }))
    }

    return suite('操作校验器', results)
}

// ═══════════════════════════════════════════════════════════════════
// Suite 5: 撤销栈
// ═══════════════════════════════════════════════════════════════════

function testUndoStack(): TestSuite {
    const results: TestResult[] = []

    // --- push ---
    {
        const graph = makeTwoNodeGraph()
        const stack = pushUndoSnapshot([], graph)
        results.push({
            name: 'pushUndoSnapshot 栈长度 +1',
            passed: stack.length === 1,
        })
    }

    // --- shouldPushUndoSnapshot ---
    {
        results.push({
            name: 'delete_node 触发 undo 快照',
            passed: shouldPushUndoSnapshot({ type: 'delete_node', nodeId: 'x' as NodeId }),
        })
        results.push({
            name: 'delete_edge 触发 undo 快照',
            passed: shouldPushUndoSnapshot({ type: 'delete_edge', edgeId: 'x' as EdgeId }),
        })
        results.push({
            name: 'add_node 不触发 undo 快照',
            passed: !shouldPushUndoSnapshot({
                type: 'add_node',
                node: createNode({ id: 'x' as NodeId, graphId: G, kind: 'real', label: 'X' }),
            }),
        })
    }

    // --- limit ---
    {
        const graph = makeTwoNodeGraph()
        let stack: GraphData[] = []
        for (let i = 0; i < 25; i++) {
            stack = pushUndoSnapshot(stack, { ...graph, id: `g-${i}` as GraphId })
        }
        results.push({
            name: '撤销栈上限 20',
            passed: stack.length === 20,
            detail: `期望 20, 实际 ${stack.length}`,
        })
    }

    return suite('撤销栈', results)
}

// ═══════════════════════════════════════════════════════════════════
// Suite 6: 持久化
// ═══════════════════════════════════════════════════════════════════

function testPersistence(): TestSuite {
    const results: TestResult[] = []

    const persistGraphId = 'test-persist' as GraphId
    const testGraph = createChainDAG(3, persistGraphId)

    // 清理旧数据
    deleteGraph(persistGraphId)

    // --- save + load ---
    {
        saveGraph(testGraph)
        const loaded = loadGraph(persistGraphId)

        results.push({
            name: 'save → load 往返',
            passed: loaded !== null,
            detail: loaded ? undefined : 'loadGraph 返回 null',
        })
        results.push({
            name: 'save → load 数据一致 (节点数)',
            passed: loaded !== null && loaded.nodes.length === testGraph.nodes.length,
            detail: `期望 ${testGraph.nodes.length}, 实际 ${loaded?.nodes.length}`,
        })
        results.push({
            name: 'save → load 数据一致 (边数)',
            passed: loaded !== null && loaded.edges.length === testGraph.edges.length,
            detail: `期望 ${testGraph.edges.length}, 实际 ${loaded?.edges.length}`,
        })
    }

    // --- delete ---
    {
        deleteGraph(persistGraphId)
        const loaded = loadGraph(persistGraphId)
        results.push({
            name: 'delete 后 load 返回 null',
            passed: loaded === null,
        })
    }

    return suite('持久化', results)
}

// ═══════════════════════════════════════════════════════════════════
// Suite 7: Graph Store 集成
// ═══════════════════════════════════════════════════════════════════

function testGraphStoreIntegration(): TestSuite {
    const results: TestResult[] = []
    const store = useGraphStore()

    // 保存当前状态
    const savedGraph = store.currentGraph
    const savedUndoStack = [...store.undoStack]

    // --- setCurrentGraph ---
    {
        const golden = createGoldenTestGraph()
        store.setCurrentGraph(golden)
        results.push({
            name: 'setCurrentGraph 设置当前图',
            passed: store.currentGraph?.id === 'graph-golden',
            detail: `期望 graph-golden, 实际 ${store.currentGraph?.id}`,
        })
        results.push({
            name: 'setCurrentGraph 加载 6 节点',
            passed: store.currentGraph?.nodes.length === 6,
            detail: `期望 6, 实际 ${store.currentGraph?.nodes.length}`,
        })
    }

    // --- applyOperation 完整链路 ---
    {
        const graph = makeTwoNodeGraph()
        store.setCurrentGraph(graph)

        const result: ValidationResult = store.applyOperation({
            type: 'add_node',
            node: {
                role: 'knowledge',
                id: 'integrated' as NodeId,
                graphId: G,
                kind: 'real',
                form: 'atomic',
                label: '集成测试节点',
                summary: '',
                abstractionLevel: 0,
                degree: 0,
                position: { x: 100, y: 100 },
            },
        })

        results.push({
            name: 'applyOperation 返回 valid=true',
            passed: result.valid,
            detail: result.issues.map(i => i.message).join('; '),
        })
        results.push({
            name: 'applyOperation 后节点数正确',
            passed: store.currentGraph?.nodes.length === 3,
            detail: `期望 3, 实际 ${store.currentGraph?.nodes.length}`,
        })
    }

    // --- applyOperation 被校验拒绝 ---
    {
        const graph = makeTwoNodeGraph()
        store.setCurrentGraph(graph)

        const result: ValidationResult = store.applyOperation({
            type: 'delete_node',
            nodeId: 'nonexistent' as NodeId,
        })

        results.push({
            name: '非法 delete_node 返回 valid=false',
            passed: !result.valid,
            detail: result.valid ? '应拒绝但通过了' : undefined,
        })
        results.push({
            name: '非法操作后节点数不变',
            passed: store.currentGraph?.nodes.length === 2,
            detail: `期望 2, 实际 ${store.currentGraph?.nodes.length}`,
        })
    }

    // --- undoDelete ---
    {
        const graph = makeTwoNodeGraph()
        store.setCurrentGraph(graph)

        // 需要走 graph_store.applyOperation 来触发 undo 入栈
        // 注意：applyOperation 内部先 validate 再 pushUndo 再 execute
        store.applyOperation({ type: 'delete_node', nodeId: 'a' as NodeId })

        const afterDelete = store.currentGraph!.nodes.length

        store.undoDelete()

        results.push({
            name: '删除后节点数减少',
            passed: afterDelete === 1,
            detail: `期望 1, 实际 ${afterDelete}`,
        })
        results.push({
            name: 'undoDelete 恢复节点',
            passed: store.currentGraph?.nodes.length === 2,
            detail: `期望 2, 实际 ${store.currentGraph?.nodes.length}`,
        })
        results.push({
            name: 'undoDelete 恢复被删节点',
            passed: !!store.currentGraph?.nodes.find(node => n.id === 'a'),
        })
    }

    // 恢复原状态
    store.setCurrentGraph(savedGraph!)
    store.$patch({ undoStack: savedUndoStack })

    return suite('Graph Store 集成', results)
}

// ═══════════════════════════════════════════════════════════════════
// 公开入口
// ═══════════════════════════════════════════════════════════════════

/**
 * 功能：
 *     运行全部 Phase 1 自动化验收测试。
 *
 * 使用：
 *     浏览器控制台输入 window.runAllTests()
 *
 * 返回值：
 *     { suites: TestSuite[], totalPassed: number, totalFailed: number, totalTests: number }
 */
function runAllTests() {
    console.clear()
    console.log('🧪 Phase 1 自动化验收测试机')
    console.log('============================================================')

    const suites: TestSuite[] = [
        testFactoryDataIntegrity(),
        testOperationExecutor(),
        testFoldExpand(),
        testOperationValidator(),
        testUndoStack(),
        testPersistence(),
        testGraphStoreIntegration(),
    ]

    let totalPassed = 0
    let totalFailed = 0
    let totalTests = 0

    for (const s of suites) {
        logSuite(s)
        totalPassed += s.passed
        totalFailed += s.failed
        totalTests += s.tests.length
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`  总计: ${totalPassed}/${totalTests} 通过`)
    if (totalFailed > 0) {
        console.log(`  ❌ ${totalFailed} 项失败`)
    } else {
        console.log('  ✅ 全部通过')
    }
    console.log(`${'='.repeat(60)}\n`)

    return { suites, totalPassed, totalFailed, totalTests }
}

/**
 * 功能：
 *     将 runAllTests 注册到 window 对象。
 *
 * 使用：
 *     main.ts 中调用 registerTestMachine()
 */
export function registerTestMachine(): void {
    ;(window as unknown as Record<string, unknown>).runAllTests = runAllTests
}
