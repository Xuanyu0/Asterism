/**
 * useNavigationAdapter.test.ts
 *
 * 功能：
 *     导航适配层（useNavigationAdapter）的集成测试。
 *     覆盖单例性、导航派生（面包屑 / currentRootId / isAtRoot / parentGraphId / hasCurrentGraph）、
 *     切图与图谱树管理透传。
 *
 * 规则：
 *     1. 使用金牌图（graph-golden 根图 + sub-golden 子图）作为测试数据。
 *     2. 适配层为模块级单例，computed 求值 / 方法调用时解析当前激活的 Pinia——
 *        每用例独立 Pinia。单例的 computed 会缓存首次求值时的 store 依赖，
 *        因此 beforeEach 经 vi.resetModules() 重建单例，实现真正的按用例隔离。
 *     3. 需要当前图的用例显式加载金牌图（无图态用例不加载）。
 */

import { setActivePinia, createPinia } from 'pinia'

import type { GraphId, NodeId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { saveGraph, loadGraph } from '@/graph/graph_persistence'
import { createGoldenTestGraphV2 } from '@/dev/test_case_factory'

import type { NavigationAdapterAPI } from './useNavigationAdapter'

describe('useNavigationAdapter', () => {
    let navigation: NavigationAdapterAPI

    beforeEach(async () => {
        // 模块级单例的 computed 缓存首次求值时的 store 依赖；重置模块使每个用例
        // 获得全新单例与全新 computed，配合每用例独立 Pinia 实现真正隔离。
        // （vue / pinia 为 vitest 外部化依赖，重置后仍为同一实例，不会产生双实例。）
        vi.resetModules()
        setActivePinia(createPinia())
        localStorage.clear()
        const mod = await import('./useNavigationAdapter')
        navigation = mod.useNavigationAdapter()
    })

    /** 写入金牌图并加载为当前视图，返回对应 store（无图态用例不调用）。 */
    function loadGoldenGraph() {
        const golden = createGoldenTestGraphV2()
        saveGraph(golden)
        const store = useGraphStore()
        store.loadGraphToView(golden.id)
        return store
    }

    test('模块级单例：多次调用返回同一实例', async () => {
        const mod = await import('./useNavigationAdapter')
        expect(mod.useNavigationAdapter()).toBe(navigation)
    })

    test('根图视图下派生正确', () => {
        loadGoldenGraph()

        expect(navigation.breadcrumb.value).toEqual([
            { graphId: 'graph-golden', title: '金牌测试图', isCurrent: true },
        ])
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
        expect(infos.some(info => info.id === 'graph-golden')).toBe(true)
    })

    test('listRootGraphInfos 按标题排序（zh-Hans-CN）', () => {
        loadGoldenGraph()
        navigation.createRootGraph('丙图')
        navigation.createRootGraph('甲图')
        navigation.createRootGraph('乙图')

        const titles = navigation.listRootGraphInfos().map(info => info.title)
        expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')))
    })

    test('getGraphById 按 ID 查询当前注册表', () => {
        loadGoldenGraph()

        expect(navigation.getGraphById('graph-golden' as GraphId)?.title).toBe('金牌测试图')
        expect(navigation.getGraphById('graph-nonexistent' as GraphId)).toBeUndefined()
    })

    test('createRootGraph 创建根图并立即持久化，listRootGraphInfos 可见', () => {
        loadGoldenGraph()

        const id = navigation.createRootGraph('新建根图')
        expect(id).toBeTruthy()
        expect(navigation.listRootGraphInfos().some(info => info.id === id && info.title === '新建根图')).toBe(true)
    })

    test('deleteRootGraphTree 级联删除根图，listRootGraphInfos 不再可见', () => {
        loadGoldenGraph()

        const id = navigation.createRootGraph('待删除图')
        expect(navigation.listRootGraphInfos().some(info => info.id === id)).toBe(true)

        navigation.deleteRootGraphTree(id)
        expect(navigation.listRootGraphInfos().some(info => info.id === id)).toBe(false)
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

        expect(navigation.listRootGraphInfos().some(info => info.id === rootId)).toBe(true)

        navigation.deleteRootGraphTree(rootId)

        expect(navigation.listRootGraphInfos().some(info => info.id === rootId)).toBe(false)
        expect(loadGraph('sub-todelete' as GraphId)).toEqual({ ok: false, reason: 'missing' })
    })

    test('deleteRootGraphTree 防御：当前视图所在根图不可删除', () => {
        loadGoldenGraph()

        navigation.deleteRootGraphTree('graph-golden' as GraphId)

        expect(navigation.listRootGraphInfos().some(info => info.id === 'graph-golden')).toBe(true)
    })
})
