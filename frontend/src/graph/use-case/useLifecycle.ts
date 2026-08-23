/**
 * 生命周期管理用例层：工作根图树的恢复与兜底创建（模块级单例）。
 *
 * @remarks
 * 与 useNavigation / useGraphOperation 形态一致（懒创建 + 公开 interface）。
 * 消费方：Graph.vue 启动引导（ensureWorkspaceRoot → loadGraphToView）。
 * 创建兜底根图走 store.commitBatchToGraphs 统一管道（add_graph 信号），
 * 不直接 saveGraph / registerGraph——保证创建路径与用户操作路径一致。
 */

import type { GraphData, GraphId } from '@my-project/graph-engine'

import { generateGraphId } from '@my-project/graph-engine'

import { useGraphStore } from '@/graph/graph_store'
import { registerGraph, hasGraph } from '@/graph/graph_registry'
import {
    loadGraph,
    listSavedGraphIds,
    loadLastActiveRootId,
    clearLastActiveRootId,
} from '@/graph/graph_persistence'
import { isInRootTree } from '@/graph/utils/graph_tree'
import {
    DATA_INTEGRITY_PREFIX,
    reportCorruptedGraph,
} from '@/graph/utils/data_integrity_reporter'

/**
 * useLifecycle 返回的生命周期用例单例 API。
 */
export interface LifecycleAPI {
    /**
     * 从 lastActiveRootId 恢复工作根图及其全部子孙子图到注册表。
     *
     * @remarks
     * 启动时注入整棵根图树，保证认知操作的跨图查询（makeLookup）能命中子图。
     * 调用后 registry 可能仍为空（无历史根图 / 历史根图已删或加载失败）——
     * 调用方不得假定调用后必有图，需自行兜底。
     *
     * 异常路径处理：
     * 1. kind 非 root：开发者通道报告（LAST_ACTIVE_NOT_ROOT）并清理 lastActiveRootId
     * 2. corrupted：reportCorruptedGraph 报告并清理 lastActiveRootId
     * 3. missing：静默（正常状态）并清理 lastActiveRootId
     * 4. 无历史（loadLastActiveRootId 为空）：返回 null，不清理
     *
     * @returns 恢复的根图 ID；无健康根图时 null。
     */
    restoreLastRootTree(): GraphId | null

    /**
     * 确保工作区存在一个可用的根图：优先恢复上次工作根图树，否则创建兜底根图。
     *
     * @remarks
     * 创建兜底根图（title 'My Graph'）经 store.commitBatchToGraphs 统一管道
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
    function restoreLastRootTree(): GraphId | null {
        const registry = useGraphStore().graphRegistry
        const lastRootId = loadLastActiveRootId()
        if (!lastRootId) return null

        const rootResult = loadGraph(lastRootId)
        if (!rootResult.ok) {
            // missing（历史根图已删）与"无历史根图"同属正常状态，静默；corrupted（数据损坏）入开发者通道，
            // 使"首次使用"与"持久化数据损坏"可在开发者通道区分
            if (rootResult.reason === 'corrupted') {
                reportCorruptedGraph(lastRootId, '已跳过加载')
            }
            clearLastActiveRootId()
            return null
        }
        if (rootResult.graph.kind !== 'root') {
            reportNonRootLastActive(lastRootId)
            clearLastActiveRootId()
            return null
        }
        registerGraph(registry, rootResult.graph)

        // 预加载当前根图树的所有子图
        const allIds = listSavedGraphIds()
        for (const graphId of allIds) {
            if (graphId === lastRootId || hasGraph(registry, graphId)) continue
            const result = loadGraph(graphId)
            if (!result.ok) {
                if (result.reason === 'corrupted') {
                    reportCorruptedGraph(graphId, '已跳过加载')
                }
                continue
            }
            if (!isInRootTree(result.graph, lastRootId)) continue
            registerGraph(registry, result.graph)
        }

        return lastRootId
    }

    function ensureWorkspaceRoot(): GraphId {
        const restoredRootId = restoreLastRootTree()
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
        restoreLastRootTree,
        ensureWorkspaceRoot,
    }
}

// ── 私有辅助（开发者通道报告） ──

/**
 * lastActiveRootId 指向非根图报告（开发者通道）。恢复根图树时发现
 * lastActiveRootId 对应图 kind !== 'root'（数据异常）时调用。
 *
 * @param graphId - 非根图的 ID
 */
function reportNonRootLastActive(graphId: GraphId): void {
    console.warn(
        `${DATA_INTEGRITY_PREFIX} [LAST_ACTIVE_NOT_ROOT] lastActiveRootId 指向非根图 "${graphId}"，已清理并跳过恢复`,
    )
}
