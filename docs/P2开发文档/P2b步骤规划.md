## Phase 2b 延后任务

以下任务在 Phase 2a 完成，延后至 Phase 2b 或 Phase 3：

| 任务 | 来源 | 原因 |
|------|------|------|
| Cloud Layout 约束布局算法 | Step 7.5 | 当前用 scatterInCircle 简单替代 |
| Arrangement 草稿预览 UI | Step 11.2 | 当前直接执行 move_node，不展示草稿 |
| 操作日志 + undo | Step 12 | undo/redo 涉及操作树多分支选择、cursor 遍历语义，需用户编写 spec 后再执行 |
| 回溯按钮（←） | Step 12 | 同上，cursor 边界灰掉逻辑待 spec |
| 多选 UI（induce / internalize 入口） | Step 11.3 | 认知操作需多选节点的 UI |
| 跨图搜索 UI（diverge 入口） | Step 11.3 | diverge 需搜索浮空窗选择跨图节点 |
| 错误反馈链路（lastOperationValidation 读取端） | Phase 2 收尾 | 已写入但 0 读取，需在 NodeWindow / KnowledgeGraph 中补全 |

---
