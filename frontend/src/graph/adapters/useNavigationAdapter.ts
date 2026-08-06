/**
 * 说明：
 *
 *     导航卡片适配层模块级单例。
 *     包含面包屑路径派生、根图定位、切图与图谱树管理、根图列表与级联删除。
 *     导航卡片只消费本适配层，不再直调 graph_store。
 *
 * 调用契约：
 *
 *     1. computed 求值 / 方法调用时解析当前激活的 Pinia（内部 useGraphStore），
 *        必须在 Pinia 安装后调用。
 *     2. 后续调用返回同一实例。
 *     3. 本适配层不依赖 components/ 任何类型或模块（graph 域不反向依赖组件域）。
 */

import { computed, type ComputedRef } from 'vue'

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { listRootGraphIds, listSavedGraphIds, loadGraph, deleteGraph, loadLastActiveRootId, clearLastActiveRootId } from '@/graph/graph_persistence'
import { lookupGraph, unregisterGraph } from '@/graph/graph_registry'
import { isInRootTree } from '@/graph/utils/graph_tree'

/**
 * 说明：
 *
 *     根图谱列表项的摘要信息，供导航卡片展示根图谱列表。
 *
 * 代码修改契约：
 *
 *     1. 只包含列表展示所需的最小字段，不携带 nodes / edges。
 */
export interface RootGraphInfo {
    /** 根图 ID。 */
    id: GraphId

    /** 根图标题。 */
    title: string

    /** 最近更新时间戳（图级，引擎维护）。 */
    updatedAt?: string
}

/**
 * 说明：
 *
 *     面包屑路径段视图模型（适配层自持，与组件域 PathSegment 结构一致）。
 */
export interface NavigationSegment {
    /** 图谱 ID。 */
    graphId: GraphId

    /** 图谱标题（缺失时兜底"未命名"）。 */
    title: string

    /** 是否为当前浏览中的图谱。 */
    isCurrent: boolean
}

/**
 * 说明：
 *
 *     useNavigationAdapter 返回的导航适配层单例 API。
 */
export interface NavigationAdapterAPI {
    /** 面包屑路径段（根→叶）。 */
    breadcrumb: ComputedRef<NavigationSegment[]>

    /** 当前根图 ID（路径首段；无图时 null）。 */
    currentRootId: ComputedRef<GraphId | null>

    /** 是否位于根图（路径长度 ≤ 1）。 */
    isAtRoot: ComputedRef<boolean>

    /** 当前图父图 ID（无则 null）。 */
    parentGraphId: ComputedRef<GraphId | null>

    /** 当前图是否存在。 */
    hasCurrentGraph: ComputedRef<boolean>

    /**
     * 说明：
     *
     *     切换当前视图到指定图谱，返回是否切换成功（透传 loadGraphToView）。
     *
     * 参数：
     *
     *     graphId — 目标图谱 ID。
     */
    goToGraph(graphId: GraphId): boolean

    /**
     * 说明：
     *
     *     列出 localStorage 中全部根图谱的摘要，按标题排序（zh-Hans-CN）。
     *
     * 代码修改契约：
     *
     *     1. 数据来自持久化全量扫描，不经过 graphRegistry——
     *        registry 只持有当前根图树，无法覆盖全部根图。
     */
    listRootGraphInfos(): RootGraphInfo[]

    /**
     * 说明：
     *
     *     按 ID 从当前注册表中查找图，供面包屑标题查询等使用。
     *
     * 参数：
     *
     *     graphId — 目标图谱 ID。
     */
    getGraphById(graphId: GraphId): GraphData | undefined

    /**
     * 说明：
     *
     *     创建新的空根图并立即持久化，返回新根图 ID（转发 store.createRootGraph）。
     *
     * 参数：
     *
     *     title — 根图名称。
     */
    createRootGraph(title: string): GraphId

    /**
     * 说明：
     *
     *     级联删除根图及其全部子孙子图；若 rootId 为当前视图所在根图则拒绝。
     *
     * 参数：
     *
     *     rootId — 要删除的根图 ID，与其全部子孙子图一并删除。
     */
    deleteRootGraphTree(rootId: GraphId): void
}

let singleton: NavigationAdapterAPI | null = null

/**
 * 说明：
 *
 *     获取导航适配层模块级单例（懒创建）。
 *
 * 调用契约：
 *
 *     1. computed 求值 / 方法调用时解析当前激活的 Pinia（内部 useGraphStore），
 *        必须在 Pinia 安装后调用。
 *     2. 后续调用返回同一实例。
 */
export function useNavigationAdapter(): NavigationAdapterAPI {
    if (!singleton) {
        singleton = createNavigationAdapter()
    }
    return singleton
}

function createNavigationAdapter(): NavigationAdapterAPI {
    const breadcrumb = computed<NavigationSegment[]>(() => {
        const graphStore = useGraphStore()
        return graphStore.graphPath.map((graphId, index) => ({
            graphId,
            title: getGraphById(graphId)?.title ?? '未命名',
            isCurrent: index === graphStore.graphPath.length - 1,
        }))
    })

    const currentRootId = computed<GraphId | null>(() => useGraphStore().graphPath[0] ?? null)
    const isAtRoot = computed<boolean>(() => useGraphStore().graphPath.length <= 1)
    const parentGraphId = computed<GraphId | null>(() => useGraphStore().graphView?.parentGraphId ?? null)
    const hasCurrentGraph = computed<boolean>(() => useGraphStore().graphView !== null)

    function goToGraph(graphId: GraphId): boolean {
        return useGraphStore().loadGraphToView(graphId)
    }

    function getGraphById(graphId: GraphId): GraphData | undefined {
        return lookupGraph(useGraphStore().graphRegistry, graphId)
    }

    function listRootGraphInfos(): RootGraphInfo[] {
        const infos: RootGraphInfo[] = []

        for (const graphId of listRootGraphIds()) {
            const graph = loadGraph(graphId)
            if (!graph) continue
            infos.push({ id: graph.id, title: graph.title, updatedAt: graph.updatedAt })
        }

        return infos.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    }

    function createRootGraph(title: string): GraphId {
        return useGraphStore().createRootGraph(title)
    }

    function deleteRootGraphTree(rootId: GraphId): void {
        const graphStore = useGraphStore()

        // 防御：禁止删除当前视图所在的根图。
        const currentRootId = graphStore.graphPath[0]
        if (currentRootId !== undefined && currentRootId === rootId) {
            return
        }

        // 收集整棵树的成员。
        const treeIds: GraphId[] = []
        for (const graphId of listSavedGraphIds()) {
            if (graphId === rootId) {
                treeIds.push(graphId)
                continue
            }

            const graph = loadGraph(graphId)
            if (!graph || !isInRootTree(graph, rootId)) continue

            treeIds.push(graphId)
        }

        // 收集完后，统一删除
        for (const graphId of treeIds) {
            deleteAndUnregisterGraph(graphId)
        }

        if (loadLastActiveRootId() === rootId) {
            clearLastActiveRootId()
        }
    }

    return {
        breadcrumb,
        currentRootId,
        isAtRoot,
        parentGraphId,
        hasCurrentGraph,
        goToGraph,
        listRootGraphInfos,
        getGraphById,
        createRootGraph,
        deleteRootGraphTree,
    }
}

// ── 私有辅助（随 deleteRootGraphTree 从 graph_store 迁入） ──

function deleteAndUnregisterGraph(graphId: GraphId): void {
    deleteGraph(graphId)
    unregisterGraph(useGraphStore().graphRegistry, graphId)
}
