/**
 * 生命周期管理用例层：全量注册、上次视图恢复与兜底创建（模块级单例）。
 *
 * @remarks
 * 与 useNavigation / useGraphOperation 形态一致（懒创建 + 公开 interface）。
 * 消费方：Graph.vue 启动引导（registerAllGraphs → ensureWorkspaceRoot → loadGraphToView）。
 * 创建兜底根图走 store.commitBatchToGraphs 统一管道（add_graph 信号），
 * 不直接 saveGraph / registerGraph——保证创建路径与用户操作路径一致。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { generateGraphId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { registerGraph } from '@/graph/graph_registry'
import {
    loadGraph,
    listSavedGraphIds,
    loadLastActiveRootId,
    clearLastActiveRootId,
} from '@/graph/graph_persistence'
import {
    DATA_INTEGRITY_PREFIX,
    reportCorruptedGraph,
} from '@/graph/utils/data_integrity_reporter'

/**
 * useLifecycle 返回的生命周期用例单例 API。
 */
export interface LifecycleAPI {
    /**
     * 全量注册所有持久化图到注册表。
     *
     * @remarks
     * 启动时遍历全部持久化图逐图加载注册（不再按根图树过滤），
     * 使注册表覆盖全部图，保证跨图查询（makeLookup）与任意图导航都能命中。
     * 只做注册，恢复上次视图由 {@link restoreLastActiveRootId} 负责。
     */
    registerAllGraphs(): void

    /**
     * 恢复上次视图根图 ID。
     *
     * @remarks
     * 读取 lastActiveRootId 并验证其指向健康根图（kind === 'root' 且在注册表）。
     * 异常路径清理 lastActiveRootId 并返回 null：
     * 1. kind 非 root：开发者通道报告（LAST_ACTIVE_NOT_ROOT）
     * 2. 不在注册表：corrupted（registerAllGraphs 已报告）或 missing（已删），静默
     * 3. 无历史（loadLastActiveRootId 为空）：返回 null，不清理
     *
     * 调用前提：registerAllGraphs 已执行（注册表覆盖全部图）。
     *
     * @returns 上次视图根图 ID；无健康根图时 null。
     */
    restoreLastActiveRootId(): GraphId | null

    /**
     * 确保工作区存在一个可用的根图：优先恢复上次视图根图，否则创建兜底根图。
     *
     * @remarks
     * 无副作用（不做注册）——注册由 registerAllGraphs 负责，本函数只恢复或创建。
     * 创建兜底根图（title '新图谱'）经 store.commitBatchToGraphs 统一管道
     * （add_graph 信号操作，recordLog: false），不直接 saveGraph / registerGraph。
     *
     * @returns 可用的根图 ID（恢复的或新建的）。
     */
    ensureWorkspaceRoot(): GraphId
}

let singleton: LifecycleAPI | null = null

/**
 * 获取生命周期用例层模块级单例（懒创建）。
 *
 * @remarks
 * 方法调用时解析 GraphStore 模块级单例（内部 useGraphStore），懒创建，无前置初始化。
 */
export function useLifecycle(): LifecycleAPI {
    if (!singleton) {
        singleton = createLifecycle()
    }
    return singleton
}

function createLifecycle(): LifecycleAPI {
    function registerAllGraphs(): void {
        const registry = useGraphStore().graphRegistry

        // 全量注册：遍历所有持久化图逐图加载注册（不再按根图树过滤）
        for (const graphId of listSavedGraphIds()) {
            const result = loadGraph(graphId)
            if (!result.ok) {
                if (result.reason === 'corrupted') {
                    reportCorruptedGraph(graphId, '已跳过加载')
                }
                continue
            }
            registerGraph(registry, result.graph)
        }
    }

    function restoreLastActiveRootId(): GraphId | null {
        const registry = useGraphStore().graphRegistry
        const lastRootId = loadLastActiveRootId()
        if (!lastRootId) return null

        const lastRootGraph = registry.get(lastRootId)
        if (!lastRootGraph) {
            // 不在注册表：corrupted（registerAllGraphs 已报告）或 missing（已删）——清理并返回 null
            clearLastActiveRootId()
            return null
        }
        if (lastRootGraph.kind !== 'root') {
            reportNonRootLastActive(lastRootId)
            clearLastActiveRootId()
            return null
        }
        return lastRootId
    }

    function ensureWorkspaceRoot(): GraphId {
        const restoredRootId = restoreLastActiveRootId()
        if (restoredRootId) return restoredRootId

        // 无健康根图：构造空根图并走统一管道创建（add_graph 信号 → 注册 + 持久化）
        const graph: GraphData = {
            id: generateGraphId(),
            kind: 'root',
            title: '新图谱',
            nodes: [],
            edges: [],
            cognitiveState: { foldedDependencies: [] },
        }
        useGraphStore().commitBatchToGraphs(
            [
                {
                    kind: 'graphLevel',
                    operations: [{ type: 'add_graph', graph }],
                },
            ],
            { recordLog: false },
        )

        return graph.id
    }

    return {
        registerAllGraphs,
        restoreLastActiveRootId,
        ensureWorkspaceRoot,
    }
}

// ── 私有辅助（开发者通道报告） ──

/**
 * lastActiveRootId 指向非根图报告（开发者通道）。restoreLastActiveRootId 恢复上次视图时发现
 * lastActiveRootId 对应图 kind !== 'root'（数据异常）时调用。
 *
 * @param graphId - 非根图的 ID
 */
function reportNonRootLastActive(graphId: GraphId): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [LAST_ACTIVE_NOT_ROOT] lastActiveRootId 指向非根图 "${graphId}"，已清理并跳过恢复`,
    )
}
