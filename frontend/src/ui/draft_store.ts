/**
 * 功能：
 *     管理尚未提交到 GraphData 的图对象草稿。
 *
 * 总体结构：
 *     1. DraftNode
 *     2. DraftEdge
 *     3. Draft Runtime Action
 *
 * 外部如何使用：
 *     ui_store.ts 与组件层通过本 Store 创建或销毁草稿。
 *     graph_store.ts 不直接保存 Draft。
 *
 * NOTE:
 *     Draft Runtime 位于 UI Runtime 与 Graph Runtime 之间。
 *     Draft 永远不允许直接进入 GraphData。
 */
