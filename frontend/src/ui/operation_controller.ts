/**
 * 纯 UI 编排层：负责认知/布局操作编排。
 *
 * @remarks
 * 工具栏工具事件、模式管理、默认路由已分别由 feature-tools/mediator 与
 * feature-tools/default_tool.ts 接管。禁止直接修改 GraphData、禁止操作 Cytoscape
 * 实例；所有图操作通过引擎 compose → graphStore.commitBatchToGraphs 链路执行。
 */

import type { NodeId, EdgeId, GraphData } from '@my-project/graph-engine'
import type { GraphRegistry } from '@/graph/graph_registry'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperation } from '@/graph/use-case/useGraphOperation'

import { computeNodeRadiusOverrides } from '@/graph/utils/node_radius'

// compose — cognitive
import { induce as composeInduce } from '@my-project/graph-engine'
import { internalize as composeInternalize } from '@my-project/graph-engine'
import { diverge as composeDiverge } from '@my-project/graph-engine'

// ── 模块级私有辅助函数 ──

/** 在 Registry 中查找常识层图。 */
function findCommonLayer(graphRegistry: GraphRegistry): GraphData | undefined {
    for (const [, graph] of graphRegistry) {
        if (graph.kind === 'commonLayer') {
            return graph
        }
    }

    return undefined
}

// ── useOperationController ──

/**
 * 提供 UI 操作控制器——认知/布局操作编排。
 */
export function useOperationController() {
    const graphStore = useGraphStore()
    // 待 operation_controller 迁移后移除：用例层提供 store 查询能力
    const graphOperations = useGraphOperation()
    // ── 认知操作 ──

    /** 探索——开始新一轮学习。Phase 3 AI Runtime 实现，引擎暂无对应 compose 函数。 */
    function explore(): void {
        // TODO: Phase 3 — AI Runtime 单轮学习入口
    }

    /** 发掘——对虚节点或无向虚边开启学习。Phase 3 AI Runtime 实现。 */
    function unearth(_targetNodeId?: NodeId, _targetEdgeId?: EdgeId): void {
        // TODO: Phase 3 — AI Runtime 发掘入口
    }

    /**
     * 归纳——多个节点聚合为抽象节点 + 子图 + 沟通节点。
     *
     * @remarks
     * 委托引擎 composeInduce 产出 batches（判别联合），commitBatchToGraphs 批量提交
     * 父图和子图；任一图失败则整批丢弃。
     */
    function induce(nodeIds: NodeId[]): void {
        if (!graphStore.graphView || nodeIds.length < 2) {
            return
        }

        const result = composeInduce({
            nodeIds,
            parentGraph: graphStore.graphView,
            // 待 operation_controller 迁移后移除：经用例层取 makeLookup
            lookupGraph: graphOperations.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(
                graphStore.graphView,
            ),
            allEdges: graphStore.graphView.edges,
        })

        // compose 校验收口在用例层：失败则写 lastValidationResult 并阻断本次操作
        if (graphOperations.reportComposeValidation(result.issues, 'graph')) {
            return
        }

        // 批次判别联合 → commitBatchToGraphs 直接提交（applyBatches 统一执行图内 / 图级批）
        graphStore.commitBatchToGraphs(result.batches, { source: 'induce' })
    }

    /**
     * 内化——将知识节点从工作区转移至常识层。
     *
     * @remarks
     * 委托引擎 composeInternalize 产出 batches（判别联合，父图 / 子图 / 常识层各成
     * inGraph 批），commitBatchToGraphs 直接提交（applyBatches 统一执行）。当前 registry
     * 中未找到常识层图时拒绝执行。
     */
    function internalize(nodeIds: NodeId[]): void {
        if (!graphStore.graphView || nodeIds.length === 0) {
            return
        }

        const commonLayer = findCommonLayer(graphStore.graphRegistry)

        if (!commonLayer) {
            // 编程错误通道：internalize 前置条件违约（常识层图缺失，当前不可达）。
            // 前端不再构造规则展示给用户——由调用方保证常识层图存在（useLifecycle.restoreLastRootTree 建立）
            throw new Error(
                'COMMON_LAYER_NOT_FOUND: 未找到常识层图谱，无法执行内化操作。',
            )
        }

        const result = composeInternalize({
            nodeIds,
            parentGraph: graphStore.graphView,
            commonLayer,
            // 待 operation_controller 迁移后移除：经用例层取 makeLookup
            lookupGraph: graphOperations.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(
                graphStore.graphView,
            ),
        })

        // compose 校验收口在用例层：失败则写 lastValidationResult 并阻断本次操作
        if (graphOperations.reportComposeValidation(result.issues, 'graph')) {
            return
        }

        // 批次判别联合 → commitBatchToGraphs 直接提交（父图 / 子图 / 常识层各成 inGraph 批）
        graphStore.commitBatchToGraphs(result.batches, {
            source: 'internalize',
        })
    }

    /**
     * 发散——在两个知识节点间创建有向虚边，跨图时自动创建启发节点并镜像。
     *
     * @remarks
     * 委托引擎 composeDiverge 产出 batches（判别联合）。heuristicPosition 为 null 时两
     * 节点直连（同图）；非 null 时在点击位置创建启发节点（跨图）。commitBatchToGraphs
     * 批量提交 current 与 peer。
     */
    function diverge(
        sourceNodeId: NodeId,
        targetNodeId: NodeId,
        heuristicPosition: { x: number; y: number } | null,
    ): void {
        if (!graphStore.graphView) {
            return
        }

        const result = composeDiverge({
            sourceNodeId,
            targetNodeId,
            currentGraph: graphStore.graphView,
            heuristicPosition,
            // 待 operation_controller 迁移后移除：经用例层取 makeLookup
            lookupGraph: graphOperations.makeLookup(),
            graphIds: Array.from(graphStore.graphRegistry.keys()),
        })

        // compose 校验收口在用例层：失败则写 lastValidationResult 并阻断本次操作
        if (graphOperations.reportComposeValidation(result.issues, 'graph')) {
            return
        }

        // 批次判别联合 → commitBatchToGraphs 直接提交（当前图 / 对端图各成 inGraph 批）
        graphStore.commitBatchToGraphs(result.batches, { source: 'diverge' })
    }

    // ── 公开 API ──

    return {
        // 认知操作
        explore,
        unearth,
        induce,
        internalize,
        diverge,
    }
}
