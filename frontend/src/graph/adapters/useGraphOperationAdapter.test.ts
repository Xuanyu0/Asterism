/**
 * useGraphOperationAdapter.test.ts
 *
 * 功能：
 *     工具层图操作适配（useGraphOperationAdapter）的集成测试。
 *     覆盖单例性、commitToCurrentGraph 提交 + 校验同步 + 原样透传、reportComposeValidation 上报收口、
 *     clearValidationResult 校验清理。
 *
 * 规则：
 *     1. 使用金牌图（graph-golden）作为测试数据。
 *     2. 适配层为模块级单例，方法调用时解析当前 store 单例——每用例独立 store，
 *        各测试通过重新写入并加载金牌图复位状态。
 */

import { useGraphStore, resetGraphStoreForTests } from '@/graph/graph_store'
import { saveGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'
import { useGraphOperationAdapter } from './useGraphOperationAdapter'

import type { GraphId, NodeId } from '@my-project/graph-engine'
import type { GraphOperationAdapterAPI } from './useGraphOperationAdapter'

describe('useGraphOperationAdapter', () => {
    let operations: GraphOperationAdapterAPI
    let store: ReturnType<typeof useGraphStore>

    beforeEach(() => {
        resetGraphStoreForTests()
        localStorage.clear()
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        store = useGraphStore()
        store.loadGraphToView(golden.id)
        operations = useGraphOperationAdapter()
    })

    test('模块级单例：多次调用返回同一实例', () => {
        const another = useGraphOperationAdapter()
        expect(another).toBe(operations)
    })

    test('commitToCurrentGraph 提交后同步 lastValidationResult 并原样返回校验结果', () => {
        const nodeCountBefore = store.graphView!.nodes.length

        const validation = operations.commitToCurrentGraph([
            {
                type: 'add_node',
                node: {
                    id: 'node-new' as NodeId,
                    graphId: store.graphView!.id,
                    role: 'knowledge' as const,
                    kind: 'real' as const,
                    label: '新增节点',
                    degree: 0,
                    // 远离既有节点，避免触发碰撞校验
                    position: { x: 5000, y: 5000 },
                },
            },
        ])

        expect(validation.valid).toBe(true)
        // store 中的校验结果是响应式包装，用深度相等验证"原样同步"
        expect(store.lastValidationResult).toEqual(validation)
        expect(store.graphView!.nodes.length).toBe(nodeCountBefore + 1)
    })

    test('commitToCurrentGraph 校验失败时同步失败结果且不改动图', () => {
        const nodeCountBefore = store.graphView!.nodes.length

        const validation = operations.commitToCurrentGraph([
            {
                type: 'delete_node',
                nodeId: 'node-nonexistent' as NodeId,
            },
        ])

        expect(validation.valid).toBe(false)
        expect(store.lastValidationResult).toEqual(validation)
        expect(store.lastValidationResult!.issues[0]?.code).toBe(
            'NODE_NOT_FOUND',
        )
        expect(store.graphView!.nodes.length).toBe(nodeCountBefore)
    })

    test('reportComposeValidation 含 error → 写 lastValidationResult 并返回 true', () => {
        const failed = operations.reportComposeValidation(
            [
                {
                    severity: 'error',
                    code: 'EMPTY_LABEL',
                    message: '节点标签不能为空。',
                },
            ],
            'node',
            'node-1' as NodeId,
        )

        expect(failed).toBe(true)
        expect(store.lastValidationResult).toEqual({
            valid: false,
            issues: [
                {
                    severity: 'error',
                    code: 'EMPTY_LABEL',
                    message: '节点标签不能为空。',
                    targetType: 'node',
                    targetId: 'node-1',
                },
            ],
        })
    })

    test('reportComposeValidation 无 error → 不写 lastValidationResult 并返回 false', () => {
        const failed = operations.reportComposeValidation([], 'graph')

        expect(failed).toBe(false)
        expect(store.lastValidationResult).toBeNull()
    })

    test('无当前图时 commitToCurrentGraph 抛错（编程错误通道）', () => {
        // store 无公开卸载入口，直接置空 graphView 模拟无图状态
        store.graphView = null

        expect(() => operations.commitToCurrentGraph([])).toThrow()
    })

    test('commitToCurrentGraph 经 commitBatchToGraphs 提交（不再经单图包装）', () => {
        const spy = vi.spyOn(store, 'commitBatchToGraphs')

        const validation = operations.commitToCurrentGraph([
            {
                type: 'add_node',
                node: {
                    id: 'node-spy' as NodeId,
                    graphId: store.graphView!.id,
                    role: 'knowledge' as const,
                    kind: 'real' as const,
                    label: '提交测试',
                    degree: 0,
                    position: { x: 5000, y: 5000 },
                },
            },
        ])

        expect(spy).toHaveBeenCalledTimes(1)
        expect(validation.valid).toBe(true)
        spy.mockRestore()
    })

    test('makeLookup 构造跨图查询函数', () => {
        const lookup = operations.makeLookup()

        expect(lookup('graph-golden' as GraphId)?.title).toBe('金牌测试图')
        expect(lookup('graph-nonexistent' as GraphId)).toBeUndefined()
    })

    test('clearValidationResult 置空 lastValidationResult', () => {
        store.lastValidationResult = { valid: false, issues: [] }

        operations.clearValidationResult()

        expect(store.lastValidationResult).toBeNull()
    })
})
