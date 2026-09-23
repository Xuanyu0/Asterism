/**
 * persistence/ 公开面：本层唯一入口。
 *
 * @remarks
 * 调用方读写持久化数据只经此处，不直接触碰 categories/ 与 medium/。
 * 本步骤公开面只落地图数据链路所需的最小集。
 */

export { commitGraphs } from './coordination/commit'
export { exportGraphs } from './coordination/export_graphs'

export { loadGraph, listGraphIds, listRootGraphIds } from './categories/graph_data'
export { saveLastActiveRootId, loadLastActiveRootId, clearLastActiveRootId } from './categories/view_state'

export type { GraphExportEnvelope, GraphExportFormatVersion } from './coordination/export_graphs'
export type { ReadResult } from './categories/graph_data'
export type { WriteFailureReason, WriteResult } from './medium/local_storage'
