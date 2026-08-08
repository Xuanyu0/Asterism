/**
 * id.ts
 *
 * 功能：
 *     统一 ID 生成。替代 Phase 1 `operation_controller.ts` 中的 `createNodeId`/`createEdgeId`。
 *
 * 总体结构：
 *     1. generateNodeId — 生成节点 ID
 *     2. generateEdgeId — 生成边 ID
 *     3. generateGraphId — 生成图 ID
 *
 * 规则：
 *     使用 `crypto.randomUUID()` 生成加密安全 ID。Node.js 与浏览器均可使用。
 *
 * 外部如何使用：
 *     import { generateNodeId } from '@my-project/graph-engine'
 */

import type { NodeId, EdgeId, GraphId } from '../../types/graph_data'

export function generateNodeId(): NodeId {
    return crypto.randomUUID() as NodeId
}

export function generateEdgeId(): EdgeId {
    return crypto.randomUUID() as EdgeId
}

export function generateGraphId(): GraphId {
    return crypto.randomUUID() as GraphId
}
