/**
 * 导航卡片用例层模块级单例。
 *
 * @remarks
 * 包含面包屑路径派生、根图定位、切图与图谱树管理、根图列表与级联删除、根图创建与重命名。
 * 导航卡片只消费本用例层，不再直调 graph_store。computed 求值 / 方法调用时解析
 * GraphStore 模块级单例（内部 useGraphStore），懒创建，无前置初始化，后续调用返回
 * 同一实例。本用例层不依赖 components/ 任何类型或模块（graph 域不反向依赖组件域）。
 */

import { computed, type ComputedRef } from 'vue'

import type { GraphData, GraphId, ValidationResult } from '@my-project/graph-engine'

import { generateGraphId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import {
    listRootGraphIds,
    listSavedGraphIds,
    loadGraph,
    deleteGraph,
    loadLastActiveRootId,
    clearLastActiveRootId,
} from '@/graph/graph_persistence'
import { lookupGraph, unregisterGraph } from '@/graph/graph_registry'
import { isInRootTree } from '@/graph/utils/graph_tree'

/**
 * 根图谱列表项的摘要信息，供导航卡片展示根图谱列表。
 * 只包含列表展示所需的最小字段，不携带 nodes / edges。
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
 * 面包屑路径段视图模型（用例层自持，与组件域 PathSegment 结构一致）。
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
 * useNavigation 返回的导航用例层单例 API。
 */
export interface NavigationAPI {
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
     * 切换当前视图到指定图谱，返回是否切换成功（透传 loadGraphToView）。
     *
     * @param graphId - 目标图谱 ID。
     */
    goToGraph(graphId: GraphId): boolean

    /**
     * 列出 localStorage 中全部根图谱的摘要，按标题排序（zh-Hans-CN）。
     *
     * @remarks
     * 数据来自持久化全量扫描，不经过 graphRegistry——
     * registry 只持有当前根图树，无法覆盖全部根图。
     */
    listRootGraphInfos(): RootGraphInfo[]

    /**
     * 按 ID 从当前注册表中查找图，供面包屑标题查询等使用。
     *
     * @param graphId - 目标图谱 ID。
     */
    getGraphById(graphId: GraphId): GraphData | undefined

    /**
     * 创建新的空根图并立即持久化，返回新根图 ID。
     *
     * @remarks
     * 创建经 store.commitBatchToGraphs 统一管道（add_graph 信号操作，recordLog: false），
     * 不直接 saveGraph / registerGraph。opts.id 指定固定 GraphId（幂等——已存在则跳过创建）：
     * dev 种子数据（bootstrap）用它保证跨图引用（sourceGraphId）指向稳定 ID；
     * 生产路径（NavigationPanel）不传，走随机 ID。
     * 空名 / 重名（root 图间 title 唯一）由引擎 add_graph 校验兜底（EMPTY_TITLE /
     * TITLE_DUPLICATE），校验失败整批丢弃、图不落库——本函数无失败信号通道，
     * 调用方应在提交前完成重名预检（导航面板新建表单）。
     *
     * @param title - 根图名称
     * @param opts - [可选] 指定固定 GraphId
     * @returns 根图 ID（新建或已存在的原 ID）。
     */
    createRootGraph(title: string, opts?: { id?: GraphId }): GraphId

    /**
     * 重命名根图谱：整图替换并提交 update_graph 图级批（recordLog 默认 true，进操作日志）。
     *
     * @remarks
     * 防御：目标不在注册表 → 构造 TARGET_NOT_FOUND issue 写入 lastValidationResult 并返回失败
     * （不抛异常、不提交）。正常路径构造全量新图 { ...target, title, updatedAt: undefined } 提交——
     * updatedAt 显式剔除由引擎按 executedAt 补写（刷新时间戳）；逆元快照携带旧图
     * （含旧 updatedAt），undo 经 update_graph 逆元恢复历史时刻。
     * 空名（EMPTY_TITLE）/ 重名（TITLE_DUPLICATE）由引擎校验返回，commitBatchToGraphs
     * 内部已写入 lastValidationResult。
     *
     * @param graphId - 目标根图谱 ID（须在注册表）
     * @param title - 新标题（trim 后入库）
     * @returns 校验结果（valid + issues 汇总），失败时 lastValidationResult 已同步。
     */
    renameRootGraph(graphId: GraphId, title: string): ValidationResult

    /**
     * 级联删除根图及其全部子孙子图；若 rootId 为当前视图所在根图则拒绝。
     *
     * @param rootId - 要删除的根图 ID，与其全部子孙子图一并删除。
     */
    deleteRootGraphTree(rootId: GraphId): void
}

let singleton: NavigationAPI | null = null

/**
 * 获取导航用例层模块级单例（懒创建）。
 *
 * @remarks
 * computed 求值 / 方法调用时解析 GraphStore 模块级单例（内部 useGraphStore），
 * 懒创建，无前置初始化；后续调用返回同一实例。
 */
export function useNavigation(): NavigationAPI {
    if (!singleton) {
        singleton = createNavigation()
    }
    return singleton
}

function createNavigation(): NavigationAPI {
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
            const result = loadGraph(graphId)
            if (!result.ok) continue
            const graph = result.graph
            infos.push({
                id: graph.id,
                title: graph.title,
                updatedAt: graph.updatedAt,
            })
        }

        return infos.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    }

    function createRootGraph(title: string, opts?: { id?: GraphId }): GraphId {
        const id = opts?.id ?? generateGraphId()

        // 幂等：指定 ID 且图已存在时直接返回原 ID，不覆盖
        if (opts?.id && loadGraph(opts.id).ok) {
            return id
        }

        const graph: GraphData = {
            id,
            kind: 'root',
            title,
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        }

        // 创建走 commitBatchToGraphs 统一管道（add_graph 信号 → 注册 + 持久化）；
        // 空名 / 重名由引擎 add_graph 校验兜底（EMPTY_TITLE / TITLE_DUPLICATE），失败整批丢弃
        useGraphStore().commitBatchToGraphs(
            [
                {
                    kind: 'graphLevel',
                    operations: [{ type: 'add_graph', graph }],
                },
            ],
            { recordLog: false },
        )

        return id
    }

    function renameRootGraph(graphId: GraphId, title: string): ValidationResult {
        const graphStore = useGraphStore()
        const target = lookupGraph(graphStore.graphRegistry, graphId)
        if (!target) {
            const validation: ValidationResult = {
                valid: false,
                issues: [
                    {
                        severity: 'error',
                        code: 'TARGET_NOT_FOUND',
                        message: `目标根图谱不存在：${graphId}`,
                        targetType: 'graph',
                        targetId: graphId,
                    },
                ],
            }
            graphStore.lastValidationResult = validation
            return validation
        }

        // 显式剔除 updatedAt：引擎按"携带值 ?? executedAt"补写（刷新为本次执行时刻）；
        // 逆元快照仍携带旧 updatedAt，undo 时经 update_graph 逆元恢复历史时刻
        const nextGraph: GraphData = { ...target, title: title.trim(), updatedAt: undefined }

        // recordLog 默认 true：更名反映用户认知活动，进操作日志（undo / redo 可回溯）；
        // 空名 / 重名由引擎 update_graph 校验返回（EMPTY_TITLE / TITLE_DUPLICATE），内部已写 lastValidationResult
        return graphStore.commitBatchToGraphs([
            {
                kind: 'graphLevel',
                operations: [{ type: 'update_graph', graph: nextGraph }],
            },
        ]).validation
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

            const result = loadGraph(graphId)
            if (!result.ok || !isInRootTree(result.graph, rootId)) continue

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
        renameRootGraph,
        deleteRootGraphTree,
    }
}

// ── 私有辅助（随 deleteRootGraphTree 从 graph_store 迁入） ──

function deleteAndUnregisterGraph(graphId: GraphId): void {
    deleteGraph(graphId)
    unregisterGraph(useGraphStore().graphRegistry, graphId)
}
