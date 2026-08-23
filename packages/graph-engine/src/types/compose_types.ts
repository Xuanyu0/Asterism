/**
 * compose_types.ts
 *
 * 功能：
 *
 *     compose 层共享类型定义。Step 7（arrangement）和 Step 8（cognitive）共同依赖
 *     的返回契约和基础类型。
 *
 * 总体结构：
 *
 *     1. DraftPosition      — 最小位置草稿字段集
 *     2. ComposeIssue       — 操作问题（error 阻塞 / warning 提示）
 *     3. ComposeResult<D>   — 编排函数的统一返回契约
 *
 * 规则：
 *
 *     1. 草稿不进入 GraphData——它们只是渲染层的临时视觉对象。
 *        确认后才通过 operations 中的 move_node / add_node 写入。
 *     2. ComposeResult 内直接带 operations——草稿是操作过程的必然产出，
 *        不存在"只预览不执行"的路径。用户确认后前端调 applyBatch 提交。
 *     3. Draft 泛型——各编排模块可在 DraftPosition 基础上扩展（如 diverge 加 graphId）。
 */

import type { NodeId, NodePosition, GraphData } from './graph_data'
import type {
    AtomicOperationInGraph,
    AtomicGraphOperation,
    GraphOperation,
} from './atomic_operations'

/**
 * 功能：
 *
 *     最小位置草稿字段集。各编排模块可扩展此类型添加领域字段。
 *
 * 规则：
 *
 *     草稿 ID 由引擎生成临时 ID。确认后通过 GraphOperation 写入正式 ID。
 */
export interface DraftPosition {
    nodeId: NodeId
    position: NodePosition
}

/**
 * 功能：
 *
 *     编排操作产生的问题。影响前端确认按钮状态和用户提示。
 *
 * 规则：
 *
 *     - 'error'（阻塞确认）：操作不合法，按钮灰掉。如 Orbit 中节点与中心无边。
 *     - 'warning'（允许确认但提示）：操作合法但有注意事项。
 *       如 internalize 递归子图将删除沟通节点。
 *     - 展示方式（toast / 内联文案）是 UI 层决策，引擎不参与。
 */
export interface ComposeIssue {
    severity: 'error' | 'warning'
    code: string
    message: string
}

/**
 * 功能：
 *
 *     compose 编排函数的统一返回契约。
 *
 * 规则：
 *
 *     1. drafts — 渲染层预览用位置草稿。不进入 GraphData。可选——无位置预览需求的操作（如 deconstruct、induce）可省略。
 *     2. issues — 控制前端确认按钮状态。含 error 时按钮灰掉。
 *     3. operations — 确认后提交的操作序列。前端调 applyBatch 执行。
 *
 *     典型消费流程：
 *         const result = composeFn(params)
 *         若 result.drafts 存在，前端渲染预览
 *         若 result.issues 无 error → 确认按钮可用
 *         用户确认 → applyBatch(graph, result.operations)
 */
export interface ComposeResult<Draft extends DraftPosition = DraftPosition> {
    /** 渲染层预览用位置草稿。确认前仅存在于 DOM，不进入 GraphData。可选。 */
    drafts?: Draft[]

    /** 操作问题列表。含 error 时确认按钮灰掉。 */
    issues: ComposeIssue[]

    /** 确认后提交的操作序列。前端调 applyBatch(graph, operations) 执行。 */
    operations: GraphOperation[]
}

/**
 * 单批操作：图内批或图级批的判别联合。
 *
 * @remarks
 * 图内批（inGraph）委托 applyBatch 在单图内执行；图级批（graphLevel）由
 * applyBatches 兑现 add_graph / delete_graph 注册表副作用。compose 认知函数
 * 统一以 `{ batches, issues }` 返回，图级操作独立成 graphLevel 批。
 */
export type OperationBatch =
    | {
          kind: 'inGraph'
          graph: GraphData
          operations: AtomicOperationInGraph[]
      }
    | {
          kind: 'graphLevel'
          operations: AtomicGraphOperation[]
      }
