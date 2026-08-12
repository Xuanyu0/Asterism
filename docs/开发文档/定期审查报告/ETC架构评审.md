# 问题：ETC（容易变更原则）架构评审

> 来源：oracle 架构评审（session: ora-1，2026-08-12），评审范围：全项目（frontend/ + packages/graph-engine/），已跑通全部测试（GE 151、前端 186）。
> 评审结论：**中等偏上（良好）**——单向数据流、唯一写入口、工具扩展点执行扎实；持久化 SPI 未接入与 operation_controller 双轨遗留是主要失分点。

## 亮点（已拿捏住的部分）

- **单向数据流执行到位**：grep 验证 `graph_store.ts` 之外零处直接改 GraphData，所有工具统一经 `useGraphOperationAdapter.commitToCurrentGraph` 提交；`cytoscape/` 目录不 import `@/graph` / `@/feature-tools`，无循环依赖
- **渲染隔离好**：`import 'cytoscape'` 仅存在于 `cytoscape/` 目录内；`RendererAPI` 自绘接口不暴露裸 Cy 实例，换库 = 重写该目录保持接口；语义事件面（`cy_interaction.ts`）本身库无关
- **新增工具扩展点良好**：加一个画布工具 = 新增 1 文件 + 改 2 处注册（types.ts ToolId + config.ts），mediator / 工具栏 / 事件层零修改
- **引擎公开面克制**：index.ts 只导出 6 类 API，内部实现（execute/validate/collision）不导出；`commitBatchToGraphs` JSDoc 有明确调用契约与代码修改契约

## 待修复问题

| #   | 发现                                                                                                                                                                          | 位置                                                                                                      | 建议修复                                                                                                  | 严重度 | 状态   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 1   | 持久化 SPI 是死代码：`engine/spi/persistence.ts` 与 `localStorageAdapter` 均建成但零调用，graph_store 直连同步函数；换 Supabase 需穿透 6 文件且同步→异步签名级改动              | `packages/graph-engine/src/spi/persistence.ts`、`frontend/src/graph/graph_persistence.ts:230-255`、`graph_store.ts`、`useNavigationAdapter.ts` 等 | 把 `commitBatchToGraphs` 持久化阶段注入 persistence 接口（接上已存在的 localStorageAdapter）             | 高     | 待处理 |
| 2   | operation_controller 双轨遗留：deconstruct 走 feature-tools 新链，induce/internalize/diverge 走旧链；`GraphModeSelector.vue` 调 `induce([])` 空数组必触发引擎预检错误（假接线按钮） | `frontend/src/ui/operation_controller.ts`（305 行）、`GraphModeSelector.vue:44-46`、`views/Graph.vue:127`  | 执行 operation_controller 迁移（参照 cognition/deconstruct.ts 96 行模板），删除 controller                 | 高     | 待处理 |
| 3   | `commitBatchToGraphs` 单体函数过重：160 行身兼 5 职（执行/逆元收集/registry 兑现/持久化/日志），options 4 个可选字段                                                              | `frontend/src/graph/graph_store.ts:299-460`                                                               | 拆为私有函数 + 持久化阶段抽为可注入接口（与 #1 一并解决）                                                 | 中     | 待处理 |
| 4   | Vue proxy 摩擦散落 4 处：引擎 `structuredClone` 不能吃 Vue proxy 的"隐形契约"未在单点收口，新功能随时可能再踩                                                                | `graph_store.ts:319/447`、`default_tool.ts:151`、`preview_engine.ts:253-255`                               | 适配层提供统一 `toRawGraph()` 收口，或提升为引擎侧文档化调用契约                                          | 中     | 待处理 |
| 5   | 两套搜索并存：引擎 `infrastructure/search.ts` 实现+测试齐全，前端 SearchPanel 却本地 computed 过滤自实现（比未使用更糟的重复实现）                                              | `packages/graph-engine/src/infrastructure/search.ts`、`SearchPanel.vue:54`                                | 前端接入引擎搜索，删本地实现                                                                              | 中     | 待评估 |
| 6   | `GraphModeSelector.vue` 直接 import `ui/operation_controller`，与 `components/AGENTS.md` 自身声明的"子组件不导入 operationController/toolMediator"规则冲突                     | `GraphModeSelector.vue:75`                                                                                | 随 #2 迁移消除                                                                                            | 低     | 待处理 |

## 可以改进的地方

- **工具层 → 渲染层反向依赖**：`toolbar/add_node.ts:28`、`add_edge.ts:15`、`move_node.ts:24` 直接 import `useRenderer`（预览通道）。CLAUDE.md 明示允许，但换渲染库时这 3 个工具必然跟着改
- **引擎未消费 API 属 YAGNI 边缘**：`searchNodes` / `replayGraph` / `pathLayout` / `orbit` / `adjustDistance` 前端零调用，但有测试兜底、风险可控；是否 Phase 3 预留取决于产品路线图（见不确定事项）
- **组件层越层**：`GraphNodeWindow.vue:106` import useRenderer（attachPopper）、`NavigationPanel.vue:36` 直连适配层，`components/AGENTS.md` 自认技术债

## 已知隐患（已标记但尚未解决）

| 发现                                                              | 位置                                          | 影响范围                                                                             | 状态           |
| ----------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- |
| 时间戳非确定性 `new Date().toISOString()`                         | `core/execute.ts` 7 处 + compose 5 处         | 当前快照式 undo 不受影响；升级 Event Sourcing 需提升为参数（详见 GE待处理问题.md）   | 已知，低优先级 |
| `commitBatchToGraphs` 静默错误路径（文件头 TODO 自认）             | `frontend/src/graph/graph_store.ts`           | 错误处理策略未定，对 ETC 影响程度待评估                                               | 已知           |

## 不确定事项

- **未使用引擎 API 的定位**：`searchNodes` / `replayGraph` 等是"Phase 3 预留"还是"YAGNI 违反"，取决于产品路线图，无法从代码确认（已按"引擎独立包 + 有测试兜底"从轻处理）
- **`spi/persistence.ts` 归属**：与 GE 评审结论一致——接口声明存在但引擎内部零消费（100% 由前端实现），当前更像前端接口而非引擎 SPI；Phase 3 AI Runtime 是否需要待确认
