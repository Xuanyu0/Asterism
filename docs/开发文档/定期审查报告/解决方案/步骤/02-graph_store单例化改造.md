# 02-graph_store单例化改造

---

## 1. graphView 浅引用改造 ✅

### 目标

graphView 改 shallowRef 持有，当前视图图数据永不进深代理。消除依赖 graphView raw 的 proxy workaround。

### 1.1. graphView → shallowRef

**已完成**：`graphView` 由 `ref` 改 `shallowRef`（graph_store.ts），`.value` 保持 raw。

### 1.2. 消费方 workaround 消除

**已完成**：`default_tool.ts` 消除 toRaw；`preview_engine.ts` cloneGraph 改 structuredClone；`useFloatingWindow.ts` 配套（floatingData → shallowRef，消除 toRaw 的必要前提）。

### 1.3. 渲染链路验证

**已完成**：Graph.vue 渲染同步照常（watch 只依赖引用层面），前端测试全绿（183）。

### 决策项

**已确定决策**：
* 本子步骤已完成（fixer 执行，用户检查通过）。
* cy_element_mapper 的 position 拷贝保留（架构防御：渲染层只读映射，GraphData 唯一事实源）。

---

## 2. graph_store 单例化改造（去死 ref + 移除 Pinia + 单例化） ⏳

### 目标

移除 Pinia 依赖，改造成项目已有的单例模式风格（模块级单例 + 组合式函数 + 公开 interface）。同时消灭无 UI 响应式消费的"死 ref"，消除误导与混乱。

**子步骤 2（去死 ref）与子步骤 3（移除 Pinia）合并的原因**：Pinia 的 setup store 强制用 ref/reactive 定义状态，普通字段在 Pinia 下不被管理（store.xxx 读不到）。去死 ref 的"降级为普通字段"与移除 Pinia 是同一件事的两面——移除 Pinia 后普通字段是自然形态。分开做会在 Pinia 下产生"普通字段不被管理"的中间态。

### 2.1. 死 ref 审计与降级

**子目标**：
  * 审计 graph_store 各 ref 的 UI 响应式消费（watch/computed/模板依赖）
  * 保留响应式：`graphView`（Graph.vue watch）、`graphPath`（导航面包屑）、`lastValidationResult`（canvasErrorIssues）
  * 降级为普通字段：`graphRegistry` / `operationLog` / `redoStack`（无 UI 消费）
  * 删除：`lastSaveTime`（只写不读，无任何消费）

难度：
* 不确定度：低（oracle 已审计消费点）
* 算法复杂度：无
* 工作量：小

### 2.2. 移除 Pinia，单例化

**子目标**：
  * 移除 Pinia 依赖（package.json、main.ts 的 createPinia）
  * 模块级单例 + 组合式函数 `useGraphStore()` 返回公开 interface
  * 用 `shallowReactive` 单例保持 `store.graphView` 无 `.value` 访问形态（90 处调用点零改动）
  * 公开 interface：只读 state + 方法入口（语义化命名）
  * 测试隔离：`resetGraphStoreForTests()` 替代 `setActivePinia(createPinia())`

难度：
* 不确定度：中（影响整个前端调用点 + 测试 setup）
* 算法复杂度：无
* 工作量：大

### 2.3. OOP 化（语义命名 + 职责分组）

**子目标**：
  * 函数语义化命名：`loadGraphToView` → `openGraph`、`initRegistry` + 哨兵 + 兜底 → `restoreSession` 等
  * 启动引导舞收口（Graph.vue onMounted 四步序列 → 单方法）
  * 状态分类分组（视图态 / 多图缓存 / 撤销日志 / 校验瞬态）

难度：
* 不确定度：中（语义命名需用户确认，避免破坏调用方）
* 算法复杂度：无
* 工作量：中

### 影响范围

```
frontend/src/
├── graph/graph_store.ts          — 修改（单例化 + interface + 语义命名 + 去死 ref）
├── main.ts                       — 修改（移除 createPinia）
├── package.json                  — 修改（移除 pinia 依赖）
├── 测试文件（29 处 setActivePinia）— 修改（resetGraphStoreForTests）
└── 各调用点（useGraphStore）      — 不改（保持调用形态）
```

### 决策项

**待确定决策**：

> **Q1**：OOP 形态（interface + closure / class）？
> **建议**：interface + closure（与 adapter 已有先例一致）。
> **理由**：oracle 与 librarian 一致倾向；class 是可选等价物，功能等价。

> **Q2**：测试隔离机制（resetGraphStoreForTests / 工厂注入）？
> **建议**：resetGraphStoreForTests（单例置空）。
> **理由**：oracle 倾向；影响 29 处测试文件的机械替换方式。

> **Q3**：语义化命名（openGraph / restoreSession 等）是否采用？
> **建议**：采用，但需用户确认命名，避免破坏调用方。
> **理由**：oracle 指出函数名语义不足（loadGraphToView 实际干 5 件事）。

**已确定决策**：
* 移除 Pinia（决策点 1 已确认 A）。
* 子步骤 2 + 3 合并（去死 ref 与移除 Pinia 是同一件事的两面）。
* 保持 `useGraphStore()` 调用签名与解包访问形态（shallowReactive 单例，90 处调用点零改动）。
* 接受 devtools 状态面板与 store HMR 的损失（MVP 单 store，价值低）。

---

## 3. 评估图级信号兑现迁移方案 ⏳

### 目标

评估 add/delete_graph 正操作与逆操作从 GE 端割裂拆分的问题，确定统一迁移方案（GE 契约变更）。

### 3.1. 割裂问题分析

**子目标**：
  * 确认割裂现状：GE 对 add/delete_graph 静默，前端 commitBatchToGraphs 第三阶段重新扫描信号兑现；逆元模型分裂（图内走 createReversal，图级手写三段式）
  * 评估统一方案：GE 返回值携带图级副作用描述 + 逆元统一为 add↔delete 互逆

难度：
* 不确定度：高（GE 契约变更，影响面大）
* 算法复杂度：无
* 工作量：大

### 影响范围

```
packages/graph-engine/src/（applyBatch 返回值 + createReversal 图级逆元）
frontend/src/graph/graph_store.ts（applyEntry 三段式退化）
```

### 决策项

**待确定决策**：

> **Q4**：图级信号进 GE 返回值的具体形态？
> **建议**：applyBatch 返回值携带 `graphSignals: { added: GraphData[]; deleted: GraphId[] }`（副作用描述，不执行——保持纯函数）；逆元统一为 add↔delete 互逆。
> **理由**：决策点 2 已确认 A（统一）；GE 成为图级操作的决策点，Runtime 仍是执行点。

**已确定决策**：
* 图级信号进 GE 返回值（决策点 2 已确认 A）。
* 本子步骤为**评估**：确定迁移方案后，作为独立步骤实施（GE 契约变更需同步改 GE 测试与前端三段式）。