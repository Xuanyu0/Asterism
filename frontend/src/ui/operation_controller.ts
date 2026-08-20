/**
 * operation_controller.ts
 *
 * 功能：
 *
 *     纯 UI 适配层。负责认知/布局操作编排。
 *     工具栏工具事件已由 feature-tools/mediator 接管。
 *     模式管理已由 feature-tools/mediator 统一接管。
 *     默认路由已由 feature-tools/default_tool.ts 接管。
 *
 * 总体结构：
 *
 *     1. 私有辅助函数
 *     2. useOperationController()：
 *        - 认知操作  — induce / internalize / diverge / explore / unearth
 *
 * 规则：
 *
 *     1. 禁止直接修改 GraphData。
 *     2. 禁止操作 Cytoscape 实例。
 *     3. 所有图操作通过引擎 compose → graphStore.applyBatch 链路执行。
 */

import type { NodeId, EdgeId, GraphData } from '@my-project/graph-engine'
import type { GraphRegistry } from '@/graph/graph_registry'

import { useGraphStore } from '@/graph/graph_store'
import { useGraphOperationAdapter } from '@/graph/adapters/useGraphOperationAdapter'
import { useNavigationAdapter } from '@/graph/adapters/useNavigationAdapter'

import { computeNodeRadiusOverrides } from '@/graph/utils/node_radius'

// compose — cognitive
import { induce as composeInduce } from '@my-project/graph-engine'
import { internalize as composeInternalize } from '@my-project/graph-engine'
import { diverge as composeDiverge } from '@my-project/graph-engine'

// ── 模块级私有辅助函数 ──

/**
 * 功能：
 *
 *     在 Registry 中查找常识层图。
 */
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
 * 功能：
 *
 *     提供 UI 操作控制器——认知/布局操作编排。
 *     工具栏工具事件已由 feature-tools/mediator 接管。
 *     模式管理已由 feature-tools/mediator 统一接管。
 *     默认路由已由 feature-tools/default_tool.ts 接管。
 *
 * 规则：
 *
 *     1. 禁止直接修改 GraphData。
 *     2. 禁止操作 Cytoscape 实例。
 *     3. 所有图操作通过引擎 compose → graphStore.applyBatch 链路执行。
 */
export function useOperationController() {
    const graphStore = useGraphStore()
    // 待 operation_controller 迁移后移除：适配层提供 store 查询能力
    const graphOperations = useGraphOperationAdapter()
    const navigation = useNavigationAdapter()
    // ── 认知操作 ──

    /**
     * 功能：
     *
     *     探索——开始新一轮学习。
     *
     * 规则：
     *
     *     Phase 3 AI Runtime 实现。引擎暂无对应 compose 函数。
     */
    function explore(): void {
        // TODO: Phase 3 — AI Runtime 单轮学习入口
    }

    /**
     * 功能：
     *
     *     发掘——对虚节点或无向虚边开启学习。
     *
     * 规则：
     *
     *     Phase 3 AI Runtime 实现。引擎暂无对应 compose 函数。
     */
    function unearth(_targetNodeId?: NodeId, _targetEdgeId?: EdgeId): void {
        // TODO: Phase 3 — AI Runtime 发掘入口
    }

    /**
     * 功能：
     *
     *     归纳——多个节点聚合为抽象节点 + 子图 + 沟通节点。
     *
     * 规则：
     *
     *     1. 委托引擎 composeInduce 产出跨图 operations。
     *     2. commitBatchToGraphs 批量提交父图和子图。
     *     3. 任一图失败则整批丢弃。
     */
    function induce(nodeIds: NodeId[]): void {
        if (!graphStore.graphView || nodeIds.length < 2) {
            return
        }

        const result = composeInduce({
            nodeIds,
            parentGraph: graphStore.graphView,
            // 待 operation_controller 迁移后移除：经适配层取 makeLookup
            lookupGraph: graphOperations.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(
                graphStore.graphView,
            ),
            allEdges: graphStore.graphView.edges,
        })

        // compose 校验收口在适配层：失败则写 lastValidationResult 并阻断本次操作
        if (graphOperations.reportComposeValidation(result.issues, 'graph')) {
            return
        }

        const targets = []

        if (result.operations.parent.length > 0) {
            targets.push({
                graph: graphStore.graphView,
                operations: result.operations.parent,
            })
        }

        if (result.operations.child.length > 0) {
            targets.push({
                graph: result.childGraphData,
                operations: result.operations.child,
            })
        }

        // commitBatchToGraphs 内部已同步校验结果到 lastValidationResult，无需重复写入
        graphStore.commitBatchToGraphs(targets, { source: 'induce' })
    }

    /**
     * 功能：
     *
     *     内化——将知识节点从工作区转移至常识层。
     *
     * 规则：
     *
     *     1. 委托引擎 composeInternalize 产出跨图 operations。
     *     2. commitBatchToGraphs 批量提交父图和常识层。
     *     3. 当前 registry 中未找到常识层图时拒绝执行。
     *
     * 注意：
     *
     *     composeInternalize 返回的 operations.child 是按子图分组的删除操作，
     *     但当前返回结构未携带子图 ID 映射。Phase 2b 后续需补齐子图操作的多图分发。
     *     本函数当前仅提交 parent 与 commonLayer，与 Phase 2a 行为保持一致。
     */
    function internalize(nodeIds: NodeId[]): void {
        if (!graphStore.graphView || nodeIds.length === 0) {
            return
        }

        const commonLayer = findCommonLayer(graphStore.graphRegistry)

        if (!commonLayer) {
            // 编程错误通道：internalize 前置条件违约（常识层图缺失，当前不可达）。
            // 前端不再构造规则展示给用户——由调用方保证常识层图存在（useLifecycleAdapter.restoreLastRootTree 建立）
            throw new Error(
                'COMMON_LAYER_NOT_FOUND: 未找到常识层图谱，无法执行内化操作。',
            )
        }

        const result = composeInternalize({
            nodeIds,
            parentGraph: graphStore.graphView,
            commonLayer,
            // 待 operation_controller 迁移后移除：经适配层取 makeLookup
            lookupGraph: graphOperations.makeLookup(),
            nodeRadiusOverrides: computeNodeRadiusOverrides(
                graphStore.graphView,
            ),
        })

        // compose 校验收口在适配层：失败则写 lastValidationResult 并阻断本次操作
        if (graphOperations.reportComposeValidation(result.issues, 'graph')) {
            return
        }

        const targets = []

        if (result.operations.parent.length > 0) {
            targets.push({
                graph: graphStore.graphView,
                operations: result.operations.parent,
            })
        }

        if (result.operations.commonLayer.length > 0) {
            targets.push({
                graph: commonLayer,
                operations: result.operations.commonLayer,
            })
        }

        // commitBatchToGraphs 内部已同步校验结果到 lastValidationResult，无需重复写入
        graphStore.commitBatchToGraphs(targets, { source: 'internalize' })
    }

    /**
     * 功能：
     *
     *     发散——在两个知识节点间创建有向虚边，跨图时自动创建启发节点并镜像。
     *
     * 规则：
     *
     *     1. 委托引擎 composeDiverge 产出跨图 operations。
     *     2. heuristicPosition 为 null 时两节点直连（同图）。
     *        heuristicPosition 非 null 时在点击位置创建启发节点（跨图）。
     *     3. commitBatchToGraphs 批量提交 current 与 peer。
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
            // 待 operation_controller 迁移后移除：经适配层取 makeLookup
            lookupGraph: graphOperations.makeLookup(),
            graphIds: Array.from(graphStore.graphRegistry.keys()),
        })

        // compose 校验收口在适配层：失败则写 lastValidationResult 并阻断本次操作
        if (graphOperations.reportComposeValidation(result.issues, 'graph')) {
            return
        }

        const targets = []

        if (result.operations.current.length > 0) {
            targets.push({
                graph: graphStore.graphView,
                operations: result.operations.current,
            })
        }

        if (result.operations.peer.length > 0) {
            // 对端图：通过 registry 查找 peer 操作目标图
            for (const draft of result.drafts) {
                if (
                    'graphId' in draft &&
                    draft.graphId !== graphStore.graphView?.id
                ) {
                    // 待 operation_controller 迁移后移除：经适配层取 getGraphById
                    const peerGraph = navigation.getGraphById(draft.graphId)

                    if (peerGraph) {
                        targets.push({
                            graph: peerGraph,
                            operations: result.operations.peer,
                        })
                    }

                    break
                }
            }
        }

        // commitBatchToGraphs 内部已同步校验结果到 lastValidationResult，无需重复写入
        graphStore.commitBatchToGraphs(targets, { source: 'diverge' })
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
