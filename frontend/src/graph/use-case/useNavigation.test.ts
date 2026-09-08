/**
 * useNavigation.test.ts
 *
 * 功能：
 *     导航用例层（useNavigation）的集成测试。
 *     覆盖单例性、导航派生（面包屑 / currentRootId / isAtRoot / parentGraphId / hasCurrentGraph）、
 *     切图与图谱树管理、createRootGraph 统一管道创建（含 opts.id 幂等，重名由引擎 add_graph 校验兜底）、
 *     renameRootGraph 更名（update_graph 批构造 / TARGET_NOT_FOUND·引擎 EMPTY_TITLE·TITLE_DUPLICATE 防御 / 列表重排 / undo·redo 集成）。
 *
 * 规则：
 *     1. 使用金牌图（graph-golden 根图 + sub-golden 子图）作为测试数据。
 *     2. 用例层为模块级单例，computed 求值 / 方法调用时解析当前 store 单例——
 *        每用例独立 store。单例的 computed 会缓存首次求值时的 store 依赖，
 *        因此 beforeEach 经 vi.resetModules() 重建单例，实现真正的按用例隔离。
 *     3. 需要当前图的用例显式加载金牌图（无图态用例不加载）。
 */

import type { GraphId, NodeId } from '@my-project/graph-engine'

import { saveGraph, loadGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'

import type { NavigationAPI } from './useNavigation'

describe('useNavigation', () => {
    let navigation: NavigationAPI
    let storeModule: typeof import('@/graph/graph_store')
    let lifecycleModule: typeof import('./useLifecycle')

    beforeEach(async () => {
        // 模块级单例的 computed 缓存首次求值时的 store 依赖；重置模块使每个用例
        // 获得全新单例与全新 computed，配合每用例独立 store 单例实现真正隔离。
        // store 也经动态 import 解析——resetModules 后静态引用指向旧模块实例，
        // 会与用例层内部的新模块实例分叉成两个单例。
        // （vue 为 vitest 外部化依赖，重置后仍为同一实例，不会产生双实例。）
        vi.resetModules()
        localStorage.clear()
        storeModule = await import('@/graph/graph_store')
        storeModule.resetGraphStoreForTests()
        lifecycleModule = await import('./useLifecycle')
        const mod = await import('./useNavigation')
        navigation = mod.useNavigation()
    })

    /** 写入金牌图、全量注册并加载为当前视图，返回对应 store（无图态用例不调用）。 */
    function loadGoldenGraph() {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        // loadGraphToView 不再负责注册——先经 registerAllGraphs 全量注册所有持久化图
        lifecycleModule.useLifecycle().registerAllGraphs()
        const store = storeModule.useGraphStore()
        store.loadGraphToView(golden.id)
        return store
    }

    test('模块级单例：多次调用返回同一实例', async () => {
        const mod = await import('./useNavigation')
        expect(mod.useNavigation()).toBe(navigation)
    })

    test('根图视图下派生正确', () => {
        loadGoldenGraph()

        expect(navigation.breadcrumb.value).toEqual([{ graphId: 'graph-golden', title: '金牌测试图', isCurrent: true }])
        expect(navigation.currentRootId.value).toBe('graph-golden')
        expect(navigation.isAtRoot.value).toBe(true)
        expect(navigation.parentGraphId.value).toBeNull()
        expect(navigation.hasCurrentGraph.value).toBe(true)
    })

    test('切换到子图后面包屑 / parentGraphId / isAtRoot 随视图更新', () => {
        const store = loadGoldenGraph()
        expect(store.loadGraphToView('sub-golden' as GraphId)).toBe(true)

        expect(navigation.breadcrumb.value).toEqual([
            { graphId: 'graph-golden', title: '金牌测试图', isCurrent: false },
            { graphId: 'sub-golden', title: '金牌子图', isCurrent: true },
        ])
        expect(navigation.currentRootId.value).toBe('graph-golden')
        expect(navigation.isAtRoot.value).toBe(false)
        expect(navigation.parentGraphId.value).toBe('graph-golden')
    })

    test('无图状态：hasCurrentGraph 为 false、currentRootId 为 null', () => {
        // 不加载任何图：真实"无当前图"路径
        expect(navigation.hasCurrentGraph.value).toBe(false)
        expect(navigation.currentRootId.value).toBeNull()
        expect(navigation.isAtRoot.value).toBe(true)
        expect(navigation.parentGraphId.value).toBeNull()
        expect(navigation.breadcrumb.value).toEqual([])
    })

    test('goToGraph 透传 loadGraphToView：有效图返回 true，无效图返回 false', () => {
        loadGoldenGraph()

        expect(navigation.goToGraph('graph-silver' as GraphId)).toBe(true)
        expect(navigation.goToGraph('graph-nonexistent' as GraphId)).toBe(false)
    })

    test('listRootGraphInfos 列出持久化根图（含金牌根图）', () => {
        loadGoldenGraph()

        const infos = navigation.listRootGraphInfos()
        expect(infos.some((info) => info.id === 'graph-golden')).toBe(true)
    })

    test('listRootGraphInfos 按标题排序（zh-Hans-CN）', () => {
        loadGoldenGraph()
        navigation.createRootGraph('丙图')
        navigation.createRootGraph('甲图')
        navigation.createRootGraph('乙图')

        const titles = navigation.listRootGraphInfos().map((info) => info.title)
        expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')))
    })

    test('getGraphById 按 ID 查询当前注册表', () => {
        loadGoldenGraph()

        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌测试图')
        expect(navigation.getGraphById('graph-nonexistent' as GraphId)).toBeUndefined()
    })

    test('createRootGraph 创建根图：registry 可查、持久化可见、listRootGraphInfos 可见', () => {
        loadGoldenGraph()

        const id = navigation.createRootGraph('新建根图')
        expect(id).toBeTruthy()
        // registry 可查（add_graph 信号已注册）
        expect(storeModule.useGraphStore().graphRegistry.has(id)).toBe(true)
        // 持久化可见
        const result = loadGraph(id)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.graph.title).toBe('新建根图')
        }
        expect(navigation.listRootGraphInfos().some((info) => info.id === id && info.title === '新建根图')).toBe(true)
    })

    test('createRootGraph 指定 ID 幂等：二次调用返回原 ID 且不覆盖已持久化图', () => {
        loadGoldenGraph()

        const firstId = navigation.createRootGraph('原始标题', {
            id: 'graph-fixed' as GraphId,
        })
        expect(firstId).toBe('graph-fixed')
        const firstLoad = loadGraph('graph-fixed' as GraphId)
        expect(firstLoad.ok).toBe(true)
        if (firstLoad.ok) {
            expect(firstLoad.graph.title).toBe('原始标题')
        }

        const secondId = navigation.createRootGraph('新标题', {
            id: 'graph-fixed' as GraphId,
        })
        expect(secondId).toBe('graph-fixed')
        const secondLoad = loadGraph('graph-fixed' as GraphId)
        expect(secondLoad.ok).toBe(true)
        if (secondLoad.ok) {
            expect(secondLoad.graph.title).toBe('原始标题')
        }
    })

    test('deleteRootGraphTree 级联删除根图，listRootGraphInfos 不再可见', () => {
        loadGoldenGraph()

        const id = navigation.createRootGraph('待删除图')
        expect(navigation.listRootGraphInfos().some((info) => info.id === id)).toBe(true)

        navigation.deleteRootGraphTree(id)
        expect(navigation.listRootGraphInfos().some((info) => info.id === id)).toBe(false)
    })

    test('deleteRootGraphTree 级联删除根图及其子图', () => {
        loadGoldenGraph()
        const rootId = navigation.createRootGraph('待删根图')

        // 构造子图并持久化（模拟子图创建结果）
        saveGraph({
            id: 'sub-todelete' as GraphId,
            kind: 'subgraph',
            title: '待删子图',
            parentGraphId: rootId,
            ownerNodeId: 'node-x' as NodeId,
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        })

        expect(navigation.listRootGraphInfos().some((info) => info.id === rootId)).toBe(true)

        navigation.deleteRootGraphTree(rootId)

        expect(navigation.listRootGraphInfos().some((info) => info.id === rootId)).toBe(false)
        expect(loadGraph('sub-todelete' as GraphId)).toEqual({
            ok: false,
            reason: 'missing',
        })
    })

    test('deleteRootGraphTree 防御：当前视图所在根图不可删除', () => {
        loadGoldenGraph()

        navigation.deleteRootGraphTree('graph-golden' as GraphId)

        expect(navigation.listRootGraphInfos().some((info) => info.id === 'graph-golden')).toBe(true)
    })

    test('renameRootGraph 提交 update_graph 批：registry / 持久化更新、进操作日志、逆元携带旧 title', () => {
        const store = loadGoldenGraph()

        const result = navigation.renameRootGraph('graph-golden' as GraphId, '金牌改名图')
        expect(result.valid).toBe(true)

        // registry 与持久化同步更新
        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌改名图')
        const loaded = loadGraph('graph-golden' as GraphId)
        expect(loaded.ok).toBe(true)
        if (loaded.ok) {
            expect(loaded.graph.title).toBe('金牌改名图')
        }

        // recordLog 默认 true：更名进操作日志（undo 逆元来源）
        expect(store.operationLog.entries).toHaveLength(1)
        // 逆元携带操作前旧图全量（含旧 title），undo 时经 update_graph 整图回退
        const reversalOp = store.operationLog.entries[0]?.reversalBatches[0]?.operations[0]
        expect(reversalOp).toMatchObject({
            type: 'update_graph',
            graph: expect.objectContaining({ id: 'graph-golden', title: '金牌测试图' }),
        })
    })

    test('renameRootGraph 构造 graphLevel update_graph 批并显式剔除 updatedAt', () => {
        loadGoldenGraph()
        const store = storeModule.useGraphStore()
        const spy = vi.spyOn(store, 'commitBatchToGraphs')
        spy.mockReturnValue({ validation: { valid: true, issues: [] } })

        const result = navigation.renameRootGraph('graph-golden' as GraphId, '金牌改名图')
        expect(result.valid).toBe(true)

        expect(spy).toHaveBeenCalledTimes(1)
        const call = spy.mock.calls[0]
        if (!call) throw new Error('commitBatchToGraphs 未被调用')
        const [batches, options] = call
        // recordLog 默认 true：不传 recordLog: false
        expect(options).toBeUndefined()

        expect(batches).toHaveLength(1)
        expect(batches[0]).toMatchObject({ kind: 'graphLevel' })
        const op = batches[0]?.operations[0]
        if (!op || op.type !== 'update_graph') {
            throw new Error(`预期 update_graph 操作，实际 ${op?.type ?? 'undefined'}`)
        }
        expect(op.graph.id).toBe('graph-golden')
        expect(op.graph.title).toBe('金牌改名图')
        expect(op.graph.updatedAt).toBeUndefined()
    })

    test('renameRootGraph 防御：目标不在注册表返回 TARGET_NOT_FOUND 且写入 lastValidationResult', () => {
        loadGoldenGraph()
        const store = storeModule.useGraphStore()
        const spy = vi.spyOn(store, 'commitBatchToGraphs')

        const result = navigation.renameRootGraph('graph-ghost' as GraphId, '幽灵图')
        expect(result.valid).toBe(false)
        expect(result.issues).toEqual([
            expect.objectContaining({
                severity: 'error',
                code: 'TARGET_NOT_FOUND',
                targetType: 'graph',
                targetId: 'graph-ghost',
            }),
        ])
        // 统一校验通道：失败结果已同步到 lastValidationResult
        expect(store.lastValidationResult).toEqual(result)
        expect(spy).not.toHaveBeenCalled()
    })

    test('renameRootGraph 防御：trim 后空名由引擎返回 EMPTY_TITLE 且不落库', () => {
        loadGoldenGraph()
        const store = storeModule.useGraphStore()

        const result = navigation.renameRootGraph('graph-golden' as GraphId, '   ')
        expect(result.valid).toBe(false)
        expect(result.issues.some((issue) => issue.code === 'EMPTY_TITLE')).toBe(true)
        expect(store.lastValidationResult).toEqual(result)
        // 整批丢弃：标题未修改、不进操作日志
        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌测试图')
        expect(store.operationLog.entries).toHaveLength(0)
    })

    test('renameRootGraph 防御：与已有根图谱重名由引擎返回 TITLE_DUPLICATE 且不落库', () => {
        loadGoldenGraph()
        const store = storeModule.useGraphStore()
        navigation.createRootGraph('并列根图')

        const result = navigation.renameRootGraph('graph-golden' as GraphId, '并列根图')
        expect(result.valid).toBe(false)
        expect(result.issues.some((issue) => issue.code === 'TITLE_DUPLICATE')).toBe(true)
        expect(store.lastValidationResult).toEqual(result)
        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌测试图')
        expect(store.operationLog.entries).toHaveLength(0)
    })

    test('createRootGraph 重名：引擎 add_graph 校验兜底拒绝（不落库）', () => {
        loadGoldenGraph()
        const beforeCount = navigation.listRootGraphInfos().filter((info) => info.title === '金牌测试图').length

        const id = navigation.createRootGraph('金牌测试图')
        // 引擎 TITLE_DUPLICATE 校验兜底：重名根图数量不变，返回的 ID 未被持久化
        expect(navigation.listRootGraphInfos().filter((info) => info.title === '金牌测试图')).toHaveLength(beforeCount)
        expect(loadGraph(id).ok).toBe(false)
    })

    test('renameRootGraph 成功后列表按新标题重排', () => {
        loadGoldenGraph()
        const 丙Id = navigation.createRootGraph('丙图')
        navigation.createRootGraph('丁图')

        const result = navigation.renameRootGraph(丙Id, '阿图')
        expect(result.valid).toBe(true)

        const infos = navigation.listRootGraphInfos()
        expect(infos[0]?.id).toBe(丙Id)
        expect(infos[0]?.title).toBe('阿图')
    })

    test('renameRootGraph 集成：更名后 undo 回退旧 title、redo 重放新 title', () => {
        const store = loadGoldenGraph()

        const result = navigation.renameRootGraph('graph-golden' as GraphId, '金牌改名图')
        expect(result.valid).toBe(true)
        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌改名图')

        // undo：逆元批经 buildBatchesFromLogItems 拆分，update_graph 逆元须落在 graphLevel 批
        expect(store.undo()).toBe(true)
        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌测试图')
        const afterUndo = loadGraph('graph-golden' as GraphId)
        expect(afterUndo.ok).toBe(true)
        if (afterUndo.ok) {
            expect(afterUndo.graph.title).toBe('金牌测试图')
        }

        // redo：正向批重放，title 恢复新值
        expect(store.redo()).toBe(true)
        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌改名图')
        const afterRedo = loadGraph('graph-golden' as GraphId)
        expect(afterRedo.ok).toBe(true)
        if (afterRedo.ok) {
            expect(afterRedo.graph.title).toBe('金牌改名图')
        }
    })
})
