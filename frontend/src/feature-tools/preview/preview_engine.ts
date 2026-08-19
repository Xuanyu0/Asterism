/**
 * 说明：
 *
 *     预览层模拟管道。回答"如果对这个图施加某个操作，图会变成什么样，
 *     会不会碰撞？"，不实际修改真实图。
 *
 * 角色：
 *
 *     预览层是 GraphData 的只读模拟投影——clone 当前图 → applyBatch 模拟执行 →
 *     返回预览图 + 碰撞布尔。add_edge 的 hover 预览与 move 的拖动预览
 *     拿到预览图后交给渲染层 syncFromGraphData 整图渲染。
 *
 * 未来扩展：
 *
 *     通用 simulateCollision(graph, registry, operation) 管道供 orbit / path 预览使用。
 *     当前按 YAGNI 仅实现 add-edge（previewAddEdge）、add-node（previewAddNode）
 *     与 move（previewMoveNode）专用函数。
 */

import {
    applyBatch,
    generateEdgeId,
    generateNodeId,
    hasCollisionAt,
    moveNode,
} from '@my-project/graph-engine'

import { computeNodeRadiusOverrides } from '@/graph/utils/node_radius'
import { hasErrors } from '@/graph/utils/issue_guard'

import type {
    AddEdgeOperation,
    AddNodeOperation,
    GraphData,
    NodeId,
    NodePosition,
} from '@my-project/graph-engine'

/**
 * 说明：
 *
 *     模拟在 position 添加一个 kind 节点，返回预览图与碰撞判定。
 *     预览节点是占位形态（空 label / 空 summary / degree 0），仅用于
 *     渲染层半透明展示与碰撞探测，不进入真实图。
 *
 * 参数：
 *
 *     graph    — 操作前的 GraphData 快照。入参不被修改（structuredClone 克隆隔离）
 *     position — 待添加节点的模型坐标
 *     kind     — 'real' 实节点 / 'virtual' 虚节点
 *
 * 返回值：
 *
 *     previewGraph — 模拟添加后的预览图；valid 为 false 时等于 clone（未执行）
 *     valid        — applyBatch 校验结果；false 时碰撞布尔恒为 false
 *     collides     — 新节点与任一已有节点是否碰撞
 *     nodeId       — 预览生成的新节点 ID，渲染层据此施加 class 高亮
 *
 * 调用契约：
 *
 *     valid 为 true 时调用方应渲染 previewGraph；collides 为 true 时叠加
 *     preview-collision class（红色高亮），false 时仅渲染预览图即可。
 *
 * 注意：
 *
 *     预览节点 label 恒为空且位置可能与其他节点重叠——applyBatch 必须跳过
 *     Phase 1 校验（EMPTY_LABEL / NODE_COLLISION 会拒绝占位预览），
 *     碰撞判定由本函数的 hasCollisionAt 独立承担。
 */
export function previewAddNode(
    graph: GraphData,
    position: NodePosition,
    kind: 'real' | 'virtual',
): {
    previewGraph: GraphData
    valid: boolean
    collides: boolean
    nodeId: NodeId
} {
    const clone = structuredClone(graph)

    const nodeId = generateNodeId()

    const addNodeOp: AddNodeOperation = {
        type: 'add_node',
        node: {
            role: 'knowledge',
            id: nodeId,
            graphId: clone.id,
            kind,
            label: '',
            summary: '',
            degree: 0,
            position,
        },
    }

    // 跳过 Phase 1 前提校验（占位预览空 label 会被 EMPTY_LABEL 拒绝），
    // 碰撞判定由下方 hasCollisionAt 独立承担——复用引擎为 undo/redo 提供的 skipValidate 机制。
    const result = applyBatch(clone, [addNodeOp], { skipValidate: true })

    if (result.validation.valid === false) {
        return { previewGraph: clone, valid: false, collides: false, nodeId }
    }

    const previewGraph = result.graph
    const collides = hasCollisionAt(
        nodeId,
        position,
        previewGraph.nodes,
        computeNodeRadiusOverrides(previewGraph),
    )

    return { previewGraph, valid: true, collides, nodeId }
}

/**
 * 说明：
 *
 *     模拟在 sourceId → targetId 间添加一条边，返回预览图与两端点碰撞判定。
 *     预览图的 source/target degree 已 +1，
 *     碰撞判定在加边后的图上进行。
 *
 * 参数：
 *
 *     graph — 操作前的 GraphData 快照。入参不被修改（structuredClone 克隆隔离）
 *     edge  — 待添加边的描述。sourceId / targetId 为两端节点 ID，
 *             kind 为 'real' 实边 / 'virtual' 虚边，
 *             direction 为 'directed' 有向 / 'undirected' 无向
 *
 * 返回值：
 *
 *     previewGraph    — 模拟加边后的预览图；valid 为 false 时等于 clone（未执行）
 *     valid           — applyBatch 校验结果；false 时碰撞布尔一律为 false
 *     sourceCollides  — source 加边后（半径增大）是否与任一节点碰撞，含 target
 *     targetCollides  — target 加边后（半径增大）是否与任一节点碰撞，含 source
 *
 * 调用契约：
 *
 *     valid 为 true 时调用方应渲染 previewGraph；false 时保持现状。
 */
export function previewAddEdge(
    graph: GraphData,
    edge: {
        sourceId: NodeId
        targetId: NodeId
        kind: 'real' | 'virtual'
        direction: 'directed' | 'undirected'
    },
): {
    previewGraph: GraphData
    valid: boolean
    sourceCollides: boolean
    targetCollides: boolean
} {
    const clone = structuredClone(graph)

    const addEdgeOp: AddEdgeOperation = {
        type: 'add_edge',
        edge: {
            id: generateEdgeId(),
            graphId: clone.id,
            source: edge.sourceId,
            target: edge.targetId,
            kind: edge.kind,
            direction: edge.direction,
            label: '',
        },
    }

    const result = applyBatch(clone, [addEdgeOp])

    if (result.validation.valid === false) {
        return {
            previewGraph: clone,
            valid: false,
            sourceCollides: false,
            targetCollides: false,
        }
    }

    const previewGraph = result.graph
    const source = previewGraph.nodes.find((node) => node.id === edge.sourceId)
    const target = previewGraph.nodes.find((node) => node.id === edge.targetId)

    const sourceCollides = source?.position
        ? hasCollisionAt(
              edge.sourceId,
              source.position,
              previewGraph.nodes,
              new Map(),
          )
        : false

    const targetCollides = target?.position
        ? hasCollisionAt(
              edge.targetId,
              target.position,
              previewGraph.nodes,
              new Map(),
          )
        : false

    return { previewGraph, valid: true, sourceCollides, targetCollides }
}

/**
 * 说明：
 *
 *     模拟将 nodeId 节点移动到 desiredPosition，返回预览图与碰撞判定。
 *     move 工具拖动预览的基础：整图切到预览图后，边宽由 mapper 按新位置
 *     自动重算（与节点尺寸同源不失步），无需独立边宽逻辑。
 *
 * 调用契约：
 *
 *     collides 为 true 时调用方应渲染 previewGraph 并施加碰撞高亮
 *     （preview-collision class）；collides 为 false 时仅渲染预览图即可。
 *     moveNode 的 operations 恒生成（碰撞不阻止操作生成），applyBatch 恒 valid，
 *     故本函数不需要 valid 字段。
 */
export function previewMoveNode(
    graph: GraphData,
    nodeId: NodeId,
    desiredPosition: NodePosition,
): { previewGraph: GraphData; collides: boolean } {
    const clone = structuredClone(graph)

    const result = moveNode({
        nodeId,
        desiredPosition,
        allNodes: clone.nodes,
        nodeRadiusOverrides: computeNodeRadiusOverrides(clone),
    })

    const preview = applyBatch(clone, result.operations)

    return { previewGraph: preview.graph, collides: hasErrors(result.issues) }
}
