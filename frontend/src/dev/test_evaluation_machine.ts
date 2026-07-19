/**
 * test_evaluation_machine.ts
 *
 * 功能：
 *     Phase 1 自动化验收测试机。通过程序化调用 Graph Runtime 和 UI Runtime 的公开 API，
 *     验证数据层正确性。所有测试不依赖 Cytoscape 渲染，不检查视觉样式。
 *
 * 总体结构：
 *     1. 测试数据完整性 — 所有工厂函数产出合法 GraphData
 *     2. 撤销栈 — pushUndoSnapshot
 *     3. 持久化 — localStorage 往返
 *     4. Graph Store 集成 — store.applyBatch 全链路
 *
 * 自动化覆盖率：
 *     覆盖清单中全部数据层测试（约 70%）。视觉样式、动画、DOM 交互仍需手动。
 *
 * 外部如何使用：
 *     main.ts 中调用 registerTestMachine() → 浏览器控制台输入 window.runAllTests()
 */

import type { GraphData, GraphId, NodeId } from '@my-project/graph-engine'

import { validateGraph } from '@my-project/graph-engine'

import { pushUndoSnapshot } from '@/graph/graph_store'
import { saveGraph, loadGraph, deleteGraph } from '@/graph/graph_persistence'

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
    assembleGraph,
} from '@/dev/test_case_factory'

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
        const result = validateGraph(factory())
        results.push({
            name,
            passed: result.valid,
            detail: result.valid ? undefined : result.issues.map(i => i.message).join('; '),
        })
    }

    return suite('测试数据完整性', results)
}

// ═══════════════════════════════════════════════════════════════════
// Suite 2: 撤销栈
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
// Suite 3: 持久化
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
// Suite 4: Graph Store 集成
// ═══════════════════════════════════════════════════════════════════

function testGraphStoreIntegration(): TestSuite {
    const results: TestResult[] = []
    const store = useGraphStore()

    // 保存当前状态
    const savedGraph = store.graphView
    const savedUndoStack = [...store.undoStack]

    // --- applyBatchToGraph 完整链路 ---
    {
        const graph = makeTwoNodeGraph()
        saveGraph(graph)
        store.loadGraphToView(graph.id)

        const result = store.applyBatchToGraph(store.graphView!, [{
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
        }])

        results.push({
            name: 'applyBatchToGraph 返回 valid=true',
            passed: result.validation.valid,
            detail: result.validation.issues.map(i => i.message).join('; '),
        })
        results.push({
            name: 'applyBatchToGraph 后节点数正确',
            passed: store.graphView?.nodes.length === 3,
            detail: `期望 3, 实际 ${store.graphView?.nodes.length}`,
        })
    }

    // --- applyBatchToGraph 被校验拒绝 ---
    {
        const graph = makeTwoNodeGraph()
        saveGraph(graph)
        store.loadGraphToView(graph.id)

        const result = store.applyBatchToGraph(store.graphView!, [{
            type: 'delete_node',
            nodeId: 'nonexistent' as NodeId,
        }])

        results.push({
            name: '非法 delete_node 返回 valid=false',
            passed: !result.validation.valid,
            detail: result.validation.valid ? '应拒绝但通过了' : undefined,
        })
        results.push({
            name: '非法操作后节点数不变',
            passed: store.graphView?.nodes.length === 2,
            detail: `期望 2, 实际 ${store.graphView?.nodes.length}`,
        })
    }

    // --- undoDelete ---
    {
        const graph = makeTwoNodeGraph()
        saveGraph(graph)
        store.loadGraphToView(graph.id)

        // 需要走 graph_store.applyBatchToGraph 来触发 undo 入栈
        // 注意：applyBatchToGraph 内部先 validate 再 pushUndo 再 execute
        store.applyBatchToGraph(store.graphView!, [{ type: 'delete_node', nodeId: 'a' as NodeId }])

        const afterDelete = store.graphView!.nodes.length

        store.undo()

        results.push({
            name: '删除后节点数减少',
            passed: afterDelete === 1,
            detail: `期望 1, 实际 ${afterDelete}`,
        })
        results.push({
            name: 'undoDelete 恢复节点',
            passed: store.graphView?.nodes.length === 2,
            detail: `期望 2, 实际 ${store.graphView?.nodes.length}`,
        })
        results.push({
            name: 'undoDelete 恢复被删节点',
            passed: !!store.graphView?.nodes.find(node => node.id === 'a'),
        })
    }

    // 恢复原状态
    saveGraph(savedGraph!)
    store.loadGraphToView(savedGraph!.id)
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
