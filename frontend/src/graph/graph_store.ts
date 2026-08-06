/**
 * 说明：
 *
 *     GraphData 唯一事实源与所有图修改的唯一合法入口。
 *     持有当前图 / 路径 / 撤销栈，协调多图注册表与 localStorage 持久化。
 *
 * 职责边界：
 *
 *     留在本 store 的判定标准：
 *          Graph.vue 调用 ∨ 唯一图数据修改入口（commitBatchToGraphs）∨ 唯一图数据回溯入口（undo）。
 *
 * TODO：
 *
 *     本文件保留函数的部分错误路径静默返回（跳过 / 拒绝 / 中断），依赖调用方前置条件正确：
 *     如 initRegistry 对 missing 静默返回、buildGraphPath 防御中断仅走开发者通道记录
 *     （console.warn，用户默认不可见）。迁移至 graph/adapters 的 listRootGraphInfos /
 *     deleteRootGraphTree 同样沿用静默风格（静默跳过加载失败的图 / 静默拒绝删除活跃根图）。
 *     调用方又以兜底逻辑掩盖空状态，导致持久化数据损坏在用户层面不可见。需统一错误处理
 *     策略，待行为设计确定后处理。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { GraphData, GraphId } from '@my-project/graph-engine'
import type { GraphOperation } from '@my-project/graph-engine'
import type { ValidationResult } from '@my-project/graph-engine'

import { applyBatch, ensureDefaultCognitiveState, generateGraphId } from '@my-project/graph-engine'

import type { GraphRegistry } from '@/graph/graph_registry'
import { createRegistry, registerGraph, unregisterGraph, lookupGraph, hasGraph } from '@/graph/graph_registry'

import { saveGraph, loadGraph, deleteGraph, listSavedGraphIds, saveLastActiveRootId, loadLastActiveRootId } from '@/graph/graph_persistence'

import { isInRootTree } from '@/graph/utils/graph_tree'

const MAX_UNDO_STACK_SIZE = 20

/**
 * 说明：
 *
 *     创建 Graph Store 单例，暴露全部图操作入口（职责与边界见文件头说明）。
 *
 * 调用契约：
 *
 *     1. 图修改经 graph/adapters/useGraphOperationAdapter.commitToCurrentGraph。
 *     2. 所有修改委托引擎 applyBatch 执行 validate + execute，成功后自动持久化。
 */
export const useGraphStore = defineStore('graph_store', () => {
    const graphView = ref<GraphData | null>(null)
    const graphRegistry = ref<GraphRegistry>(createRegistry())
    const graphPath = ref<GraphId[]>([])
    const undoStack = ref<GraphData[]>([])

    const lastSaveTime = ref<number | null>(null)
    const lastValidationResult = ref<ValidationResult | null>(null)

    /**
     * 说明：
     *
     *     用户切换图谱的唯一入口：从持久化加载图谱并设为当前视图。
     *
     * 调用契约：
     *
     *     1. 本函数不负责完整图校验。
     *     2. 切换成功即清空撤销栈。
     *
     * 错误出口：
     *
     *     1. missing（图不存在）→ 静默返回 false，不写任何状态（正常状态，UI 兜底逻辑不变）。
     *     2. corrupted（图损坏）→ 走开发者通道（console.warn）后返回 false，不写 lastValidationResult。
     *     3. 祖先链断裂 / 环 → 由 buildGraphPath 回溯时走开发者通道（console.warn），图本身加载成功返回 true。
     */
    function loadGraphToView(graphId: GraphId): boolean {
        const result = loadGraph(graphId)

        if (!result.ok) {
            // missing（图不存在）为正常状态，静默；corrupted（图损坏）为系统异常，入开发者通道
            if (result.reason === 'corrupted') {
                reportCorruptedGraph(graphId)
            }
            return false
        }
        const graph = result.graph

        // 切换图谱：旧图的校验结果（错误提示）与撤销历史不再适用于新视图，一并清空
        graphView.value = ensureDefaultCognitiveState(graph)
        clearValidationResult()
        undoStack.value = []

        registerGraph(graphRegistry.value, graph)

        // 构建当前图在根图树中的路径（根→叶），供导航卡片渲染面包屑与"是否在根"判断
        const { path, terminal } = buildGraphPath(graph)
        graphPath.value = path

        // 祖先链断裂 / 环的检测与开发者通道记录在 buildGraphPath 回溯过程中完成，
        // 此处不再重复报告（否则同一异常会产出两条相同 console.warn）
        // 记录最后活跃的根图 ID：下次启动时 initRegistry 据此恢复工作根图树
        if (terminal.kind === 'root') {
            saveLastActiveRootId(terminal.id)
        }

        return true
    }

    /**
     * 说明：
     *
     *     从 lastActiveRootId 恢复工作根图及其全部子孙子图到注册表。
     *     启动时注入整棵根图树，保证认知操作的跨图查询（makeLookup）能命中子图
     *
     * 调用契约：
     *
     *     1. 应用启动时调用一次。
     *     2. 调用后 registry 可能仍为空（无历史根图 / 历史根图已删或加载失败）——
     *        调用方不得假定调用后必有图，需自行兜底。
     *
     * TODO：
     *
     *     历史根图 corrupted 已入开发者通道（console.warn）可区分"首次使用"与"数据损坏"；
     *     kind 非 root 时仍静默返回，与"无历史根图"无法区分。需为异常路径增加可见性，
     *     待行为设计确定后处理。
     */
    function initRegistry(): void {
        const lastRootId = loadLastActiveRootId()
        if (!lastRootId) return

        const rootResult = loadGraph(lastRootId)
        if (!rootResult.ok) {
            // missing（历史根图已删）与"无历史根图"同属正常状态，静默；corrupted（数据损坏）入开发者通道，
            // 使"首次使用"与"持久化数据损坏"可在开发者通道区分
            if (rootResult.reason === 'corrupted') {
                reportCorruptedGraph(lastRootId)
            }
            return
        }
        if (rootResult.graph.kind !== 'root') return
        registerGraph(graphRegistry.value, rootResult.graph)

        // 预加载当前根图树的所有子图
        const allIds = listSavedGraphIds()
        for (const graphId of allIds) {
            if (graphId === lastRootId || hasGraph(graphRegistry.value, graphId)) continue
            const result = loadGraph(graphId)
            if (!result.ok) {
                if (result.reason === 'corrupted') {
                    reportCorruptedGraph(graphId)
                }
                continue
            }
            if (!isInRootTree(result.graph, lastRootId)) continue
            registerGraph(graphRegistry.value, result.graph)
        }
    }

    /**
     * 说明：
     *
     *     创建一个新的空根图并立即持久化；若 opts.id 对应图已存在，跳过创建直接返回该 id。
     *
     * 调用契约：
     *
     *     1. 本函数不自动切换视图——调用方如需显示新图，需额外调用 loadGraphToView。
     *     2. 创建后立即保存到 localStorage 并注册到 registry。
     *
     * 参数：
     *
     *     title — 根图名称
     *     opts  — 可选。opts.id 指定固定 GraphId（幂等——已存在则跳过创建）。
     *             dev 种子数据（bootstrap）用它保证跨图引用（sourceGraphId）指向稳定 ID；
     *             生产路径（Graph.vue / NavigationPanel）不传，走随机 ID。
     */
    function createRootGraph(title: string, opts?: { id?: GraphId }): GraphId {
        const id = opts?.id ?? generateGraphId()

        // 幂等：若指定了 ID 且图已存在，直接返回，不覆盖
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

        saveGraph(graph)
        registerGraph(graphRegistry.value, graph)

        return id
    }

    /**
     * 说明：
     *
     *     清除上一次操作的校验结果。供 UI 层在切换模式/工具/操作、
     *     关闭浮空窗时调用，确保用户不会看到已过期的校验错误消息。
     */
    function clearValidationResult() {
        lastValidationResult.value = null
    }

    /**
     * 说明：
     *
     *     对多个目标图批量执行操作，是全部图写入的统一入口。
     *     执行按照四阶段：逐项 applyBatch 执行 → 成功后统一提交状态 → 兑现 add_graph / delete_graph 信号
     *     → 统一持久化。
     *
     * 调用契约：
     *
     *     1. 任一项执行失败即整批返回，不产生部分提交。
     *     2. 同一图可在 operationBatch 中出现多次，后续项以前一项的结果图为输入。
     *     3. 全部成功后统一持久化所有结果图。
     *
     * 代码修改契约：
     *
     *     1. add_graph / delete_graph 为引擎静默信号，由本函数兑现为 registry 与持久化副作用。
     *
     * TODO：
     *
     *     undo snapshot 当前在批量提交前对 graphView 只拍一次（一次批量 = 一次撤销）。
     *     该粒度语义是否成立，待 undo 接入引擎 OperationLog 后统一确定，届时本函数
     *     的快照逻辑随之调整。
     *
     * 参数：
     *
     *     operationBatch — 图与其对应的操作序列的配对数组
     */
    function commitBatchToGraphs(
        operationBatch: { graph: GraphData; operations: GraphOperation[] }[],
    ): { validation: ValidationResult } {
        // 无需空批守卫

        // 第一阶段：按顺序执行所有项，用 latestGraphs 跟踪同一图的中间状态
        const latestGraphs = new Map<GraphId, GraphData>()
        const allIssues = []

        for (const item of operationBatch) {
            const inputGraph = latestGraphs.get(item.graph.id) ?? item.graph
            const { graph: resultGraph, validation } = applyBatch(inputGraph, item.operations)

            if (!validation.valid) {
                lastValidationResult.value = validation

                return { validation }
            }

            latestGraphs.set(item.graph.id, resultGraph)
            allIssues.push(...validation.issues)
        }

        // 全部成功后：为 graphView 拍 undo snapshot（只拍一次，记录批量操作前状态）。
        // 所有修改 GraphData 的操作都需要撤销支持。
        const hasGraphViewTarget = operationBatch.some(item => item.graph.id === graphView.value?.id)
        const needsUndoSnapshot = hasGraphViewTarget
            && operationBatch.some(item => item.operations.some((op) => {
                // 仅对修改 GraphData 的操作拍 undo snapshot，非修改操作不需要。
                switch (op.type) {
                    case 'add_node':
                    case 'add_edge':
                    case 'delete_node':
                    case 'delete_edge':
                    case 'update_node':
                    case 'update_edge':
                    case 'move_node':
                    case 'collapse_dependency':
                    case 'expand_dependency':
                        return true
                    default:
                        return false
                }
            }))

        if (needsUndoSnapshot && graphView.value) {
            // 快照入栈：JSON 序列化而非 structuredClone——Pinia reactive proxy 无法被 structuredClone。
            // 入栈后截断到 MAX_UNDO_STACK_SIZE。
            const snapshot: GraphData = JSON.parse(JSON.stringify(graphView.value))
            undoStack.value = [...undoStack.value, snapshot].slice(-MAX_UNDO_STACK_SIZE)
        }

        // 第二阶段：全部成功后统一更新 state
        for (const [graphId, resultGraph] of latestGraphs) {
            // 同步更新 registry，保证 graphView 与 registry 中同图引用一致。
            // graphView 的图可能同时存在于 registry 中（例如通过 loadGraphToView 加载），
            // 只更新 graphView 会导致 registry 持有过期引用。
            registerGraph(graphRegistry.value, resultGraph)

            if (graphId === graphView.value?.id) {
                graphView.value = resultGraph
            }
        }

        // 第三阶段：处理 add_graph / delete_graph 信号操作
        //
        // 引擎 execute 层对 add_graph / delete_graph 是静默的（它们不修改 GraphData），
        // 这些操作是 compose→Runtime 的信号。graphStore 作为统一执行入口，负责把信号
        // 兑现为 registry 和持久化的副作用。
        for (const item of operationBatch) {
            for (const operation of item.operations) {
                if (operation.type === 'add_graph') {
                    registerGraph(graphRegistry.value, operation.graph)
                    saveGraph(operation.graph)
                }

                if (operation.type === 'delete_graph') {
                    unregisterGraph(graphRegistry.value, operation.graphId)
                    deleteGraph(operation.graphId)
                }
            }
        }

        // 第四阶段：统一持久化结果图
        for (const resultGraph of latestGraphs.values()) {
            saveGraph(resultGraph)
        }

        // 若当前视图图被持久化，记录最近一次保存时间。
        if (hasGraphViewTarget) {
            lastSaveTime.value = Date.now()
        }

        const validation: ValidationResult = {
            valid: true,
            issues: allIssues,
        }

        lastValidationResult.value = validation

        return { validation }
    }

    /**
     * 说明：
     *
     *     撤销最近一次操作：弹出撤销栈顶部快照并恢复为当前图。
     *
     * 调用契约：
     *
     *     1. 恢复完整 GraphData Snapshot。
     *     2. 覆盖所有修改操作（add / delete / update / move / fold / expand）。
     *     3. 刷新网页后 Undo 自动失效（快照不持久化）。
     *
     * TODO：
     *
     *     未来接入引擎 OperationLog（Event Sourcing）后，本函数将改为
     *     基于 replay 的回放式撤销，届时快照栈可移除。当前施工进度未到，
     *     暂以快照式实现占位，且尚未接线 UI 入口。
     */
    function undo(): boolean {
        const previousGraph = undoStack.value.pop()

        if (!previousGraph) {
            return false
        }
        graphView.value = previousGraph

        return true
    }

    /**
     * 说明：
     *
     *     沿 parentGraphId 链回溯，为任意图构建从根图到该图的完整路径（根→叶）。
     *     回溯途中：祖先图不在 registry 时由 findParentGraph 惰性加载并注册
     *     （保证后续引用一致）；链完整性异常（环 / 父图缺失）就地写入开发者
     *     通道记录，并在断裂处停止回溯。
     *
     * 调用契约：
     *
     *     1. 输入图需在 registry 或持久化中可达（祖先链可回溯）。
     *     2. 假定图链为树结构（单亲、无环）——环检测防御该假设被破坏。
     *     3. 返回 terminal：链末端图（根图或断裂处），调用方据此判断是否到达根。
     *     4. 环 / 父缺失的 console.warn 记录在回溯处就地完成，调用方无需重复报告。
     */
    function buildGraphPath(graph: GraphData): { path: GraphId[]; terminal: GraphData } {
        const path: GraphId[] = [graph.id]
        const visited = new Set<GraphId>([graph.id])
        let currentGraph: GraphData = graph
        while (currentGraph.parentGraphId) {
            const parentId = currentGraph.parentGraphId

            // 环检测：链应构成森林（无环），异常数据成环时防止无限循环
            if (visited.has(parentId)) {
                reportCycleDetected(parentId)
                break
            }
            visited.add(parentId)

            // 父图缺失（registry 与持久化均不可达）：链在此中断，terminal 停在断裂处
            const parent = findParentGraph(graphRegistry.value, parentId)
            if (!parent) {
                reportBrokenAncestorChain(graph.id, currentGraph.id, parentId)
                break
            }

            path.unshift(parentId)
            currentGraph = parent
        }

        return { path, terminal: currentGraph }
    }

    return {
        graphView,
        graphPath,

        graphRegistry,
        undoStack,
        lastSaveTime,
        lastValidationResult,

        // 生命周期
        loadGraphToView,
        initRegistry,
        createRootGraph,

        // 内部行为
        clearValidationResult,

        // 功能行为
        commitBatchToGraphs,
        undo,
    }
})

// ── 私有辅助（图查找） ──

/**
 * 说明：
 *
 *     查找父图：优先取 registry 中的运行时引用（避免反序列化新对象、保持引用一致），
 *     未命中则从持久化惰性加载并注册（保证后续回溯与导航引用同一对象）。
 *
 * 参数：
 *
 *     registry — 图注册表
 *     parentId — 父图 ID
 *
 * 返回：
 *
 *     父图 GraphData；registry 与持久化均不可达时返回 undefined，调用方据此判定链断裂。
 */
function findParentGraph(registry: GraphRegistry, parentId: GraphId): GraphData | undefined {
    const inRegistry = lookupGraph(registry, parentId)
    if (inRegistry) return inRegistry

    const result = loadGraph(parentId)
    if (result.ok) {
        registerGraph(registry, result.graph)
        return result.graph
    }

    return undefined
}

// ── 私有辅助（开发者通道报告） ──

/**
 * 说明：
 *
 *     开发者通道统一前缀。所有数据完整性异常报告以此开头，便于在 console 中过滤检索。
 */
const DATA_INTEGRITY_PREFIX = '[data-integrity]'

/**
 * 说明：
 *
 *     数据损坏报告（开发者通道）。持久化图谱 JSON 反序列化失败（corrupted）时调用。
 *
 * 参数：
 *
 *     graphId — 损坏图谱的 ID（报告中的 targetId）
 */
function reportCorruptedGraph(graphId: GraphId): void {
    console.warn(`${DATA_INTEGRITY_PREFIX} [CORRUPTED_GRAPH] 图谱 "${graphId}" 持久化数据损坏（JSON 解析失败），已跳过加载`)
}

/**
 * 说明：
 *
 *     祖先链断裂报告（开发者通道）。沿 parentGraphId 回溯时父图不可达（缺失或损坏）时调用。
 *
 * 参数：
 *
 *     graphId          — 发起回溯的图 ID
 *     terminalId       — 链断裂处（最后成功回溯到的图 ID）
 *     missingParentId  — 缺失的父图 ID
 */
function reportBrokenAncestorChain(graphId: GraphId, terminalId: GraphId, missingParentId: GraphId): void {
    console.warn(`${DATA_INTEGRITY_PREFIX} [ANCESTOR_CHAIN_BROKEN] 图谱 "${graphId}" 的父链在 "${terminalId}" 处中断：祖先图谱 "${missingParentId}" 不可达`)
}

/**
 * 说明：
 *
 *     环检测报告（开发者通道）。parentGraphId 链检测到环、回溯被迫中断时调用。
 *
 * 参数：
 *
 *     parentId — 导致回退的重复父图 ID（环的入口）
 */
function reportCycleDetected(parentId: GraphId): void {
    console.warn(`${DATA_INTEGRITY_PREFIX} [CYCLE_DETECTED] parentGraphId 链检测到环：图谱 "${parentId}" 被重复访问，已中断回溯`)
}
