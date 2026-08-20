# 05-graph_store核心化与生命周期适配层下沉

---

## 1. graph_store 收窄为四入口 ✅

### 目标

graph_store 正式确立为"前端核心对象 + 对接 GE 的唯一核心入口"：公开能力只保留切换、操作、回溯三类，生命周期管理与校验通知管理全部下沉适配层。

### 1.1. 公开接口收窄

**子目标**：
  * 移除公开方法：`initRegistry` / `createRootGraph` / `clearValidationResult`（分别下沉至 05.2 / 05.3 / 05.3）
  * 保留四入口：`loadGraphToView`（唯一切换）/ `commitBatchToGraphs`（唯一图操作，含 add/delete_graph 与 recordLog 选项）/ `undo` / `redo`（唯一回溯）
  * `loadGraphToView` 内部原有的校验结果清理改为内联写入，不再依赖被移除的方法

难度：
* 不确定度：低（纯接口收窄，同步改接适配层即可）
* 算法复杂度：无
* 工作量：小

## 2. 生命周期管理适配层（useLifecycleAdapter，新建）✅

### 目标

工作区生命周期（会话恢复 / 初次与多次载入引导）从 store 迁出。Graph.vue 的启动引导从"四步哨兵序列 + 偷看 registry 内部结构"收成一行调用。

### 2.1. restoreLastRootTree（吸收 initRegistry）

**子目标**：
  * 从 lastActiveRootId 恢复上次工作根图树（根图 + 全部子图）到 registry，显式返回恢复的根图 ID（消除调用方偷看 `graphRegistry.keys()` 的现状）
  * 修复已知缺口：kind 非 root 异常路径入开发者通道；恢复失败清理失效 lastActiveRootId（防每次启动重复走失败路径）；"保证跨图查询命中"措辞收窄为数据完好前提

### 2.2. ensureWorkspaceRoot（引导收口）

**子目标**：
  * 收编 Graph.vue onMounted 哨兵模式（恢复 → 加载失败降级 → 创建兜底根图），返回最终根图 ID
  * 创建兜底根图走 commitBatchToGraphs 统一管道（add_graph + recordLog: false）

难度：
* 不确定度：中（initRegistry 缺口修复涉及数据异常路径行为设计）
* 算法复杂度：无
* 工作量：中

## 3. 创建与校验清理下沉 ✅

### 目标

创建根图归位导航适配层（统一管道），校验通知管理归位操作适配层，错误通知改为浮空窗式"外部交互即关闭"。

### 3.1. 导航适配层 createRootGraph 改走统一管道

**子目标**：
  * `useNavigationAdapter.createRootGraph(title, opts?)` 内部改走 commitBatchToGraphs（add_graph + recordLog: false）——支撑用户显式新建（NavigationPanel）与 dev 种子（bootstrap 固定 ID 幂等）
  * `dev/bootstrap.ts` 改接导航适配层（opts.id 幂等语义保留），接线处注明"临时接线"——bootstrap 为 dev 种子工具，导航适配层的正式定义仅服务 NavigationPanel

### 3.2. clearValidationResult 下沉 + 外部交互关闭

**子目标**：
  * `useGraphOperationAdapter` 新增 `clearValidationResult`（与已有 `reportComposeValidation` 成对，校验状态管理在适配层收口）
  * NotificationPanel 去掉 closable 按钮；错误通知改"外部点击面板外任意处 → 适配层清错"（借鉴浮空窗隐式关闭模式）
  * `useFloatingWindow.close` 清错改调适配层

难度：
* 不确定度：中（外部点击清错的交互语义需冒烟验证）
* 算法复杂度：无
* 工作量：中

### 影响范围

新旧架构对比：

```
重构前：
Graph.vue ──→ graph_store（初始化 + 切图 + 创建 + 清错 + undo/redo 混杂）
                 ├── initRegistry / createRootGraph / clearValidationResult（生命周期与 UI 语义）
                 └── loadGraphToView / commitBatchToGraphs / undo / redo（核心入口）

重构后：
Graph.vue ──→ useLifecycleAdapter（restoreLastRootTree / ensureWorkspaceRoot）──→ graph_store
               useNavigationAdapter（createRootGraph 统一管道）──────────────→ graph_store
               useGraphOperationAdapter（clearValidationResult / reportComposeValidation）→ graph_store
               graph_store = loadGraphToView / commitBatchToGraphs / undo / redo（四入口）
```

```
frontend/src/
├── graph/graph_store.ts                        — 修改（四入口收窄 + loadGraphToView 内联清理）
├── graph/adapters/useLifecycleAdapter.ts       — 新建（restoreLastRootTree / ensureWorkspaceRoot）
├── graph/adapters/useNavigationAdapter.ts      — 修改（createRootGraph 走统一管道 + opts 透传）
├── graph/adapters/useGraphOperationAdapter.ts  — 修改（新增 clearValidationResult）
├── views/Graph.vue                             — 修改（引导一行调用 + 错误面板外部点击关闭）
├── composables/useFloatingWindow.ts            — 修改（清错改调适配层）
├── dev/bootstrap.ts                            — 修改（改接导航适配层）
├── 注释同步（graph_persistence / graph_tree / operation_controller 中 initRegistry 引用）
└── 相关测试文件（graph_store / useNavigationAdapter / useFloatingWindow / useGraphOperationAdapter）
```

### 决策项

**已确定决策**：
* store 收窄为四入口（loadGraphToView / commitBatchToGraphs / undo / redo），移除 initRegistry / createRootGraph / clearValidationResult 公开方法。
* createRootGraph 走 commitBatchToGraphs（add_graph + recordLog: false），store 成为绝对唯一写入入口。
* clearValidationResult 下沉操作适配层（与 reportComposeValidation 成对），store 内不保留该公开方法。
* 错误通知采用"外部交互即关闭"：外部点击触发范围为面板外任意处（浮空窗同构）；NotificationPanel 移除 closable。
* deleteRootGraphTree 保持现状（导航适配层，真删整棵树不可恢复）。
* delete_graph（软删子图可恢复）分支保留，待未来工具层对接（对接时需为"已删状态"提供持久化载体，防启动恢复复活）。
* 02.3 语义命名与职责重组并入本步骤实施。
* 生命周期适配层 API 命名：`restoreLastRootTree(): GraphId | null` + `ensureWorkspaceRoot(): GraphId`。
* bootstrap 改接导航适配层为**临时接线**（dev 种子工具），接线处注释说明；导航适配层 createRootGraph 的正式消费方仅 NavigationPanel。

---

## 完成摘要

* 实施完成（commit `cd2c51b`；后续调整 `5b6f3a7`）：
  * store 收窄为四入口；生命周期/校验清理方法下沉适配层
  * 新建 useLifecycleAdapter（restoreLastRootTree / ensureWorkspaceRoot），异常路径清理修复
  * 导航适配层 createRootGraph 走统一管道（含固定 ID 幂等）；操作适配层 clearValidationResult 收口
  * Graph.vue 引导单方法调用；错误通知改外部点击关闭
  * bootstrap 改接导航适配层（临时接线）；种子注入改控制台手动触发
  * 前端测试全绿（191）；vue-tsc 仅剩步骤 03 范围的 class_mapper 既有错误
