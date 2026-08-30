# 02-前端状态持有与消费方迁移

---

## 发现者:@fixer

### 需要用户确定项

#### U-1：useFloatingWindow 配套改造（范围外）

* 状态：✅ 已确认（已实施）
* 位置：`frontend/src/composables/useFloatingWindow.ts`
* 问题：fixer 实证发现 `floatingData` 的 ref 深代理会让 `.value` 读出 proxy，`{ ...proxy, label }` 的嵌套 position 仍是 proxy，structuredClone 抛 DataCloneError。因此将 `floatingData` 改为 `shallowRef`（范围外修改）。
* 影响：这是安全删除 default_tool 的 toRaw 的必要条件。
> 建议：接受配套改造。
> 理由：ref 深代理会让嵌套 proxy 泄漏进图，浅引用化是消除 toRaw 的前提。

#### U-2：preview_engine 的 cloneGraph 被内联删除

* 状态：✅ 已确认（已接受）
* 位置：`frontend/src/feature-tools/preview/preview_engine.ts`
* 问题：用户手动将 cloneGraph 函数内联删除（克隆点直接 `structuredClone(graph)`），fixer 保留内联状态避免冲突。
* 影响：结构不同于提示词描述（函数保留），功能等价。
> 建议：接受内联状态。
> 理由：功能等价，且避免与用户手动改动冲突。

#### U-3：前端 type-check 残留

* 状态：⏳ 待确认（归属步骤 03 范围）
* 位置：`frontend/src/cytoscape/mapper-utils/class_mapper.ts:27`
* 问题：`node.form` 读取（GE 类型已移除 form 字段）。属子步骤 4 范围（class_mapper 改接 deriveNodeForm），本次未修改。
* 影响：前端 type-check 仍有 2 处错误（预期内，子步骤 4 处理）。
> 建议：子步骤 4 处理 class_mapper 时改接 deriveNodeForm。
> 理由：class_mapper 属子步骤 4 变更边界。

---

## 发现者:@orchestrator

### 可改进项

#### I-1：前端残留 form/abstractionLevel 写入点已删除

* 状态：✅ 已确认（已处理）
* 位置：`add_node.ts`、`test_case_factory.ts`、`useFloatingWindow.test.ts`、`preview_engine.test.ts`、`useGraphOperationAdapter.test.ts`、`integration.test.ts`
* 现象：GE 类型移除 form/abstractionLevel 后，前端仍有写入残留（add_node.ts:156,159、test_case_factory.ts:177,315、测试文件多处），导致 type-check 报错。
* 现状：已全部删除。test_case_factory.ts 的 `form: 'abstract'` 伴随 childGraphId（:178,316），删除后 abstract 语义由 childGraphId 推导，安全。preview_engine.test.ts:315 的 `added?.form` 断言已删除（字段已移除）。type-check 只剩 class_mapper.ts:27（子步骤 4 范围）。前端测试全绿（183）。

---

## 发现者:@cleaner

### BUG

#### B-1：previousRootId 死代码 bug（预存在，非本次引入）

* 状态：✅ 已确认（已修复；用户决策接受无回归测试，记录为已知缺口）
* 位置：`frontend/src/graph/graph_store.ts:176`
* 现象：`const previousRootId = store.graphPath[0]` 在 `store.graphPath = path` **之后**读取，恒等于 `path[0]`，导致 `previousRootId !== path[0]` 恒为 false，分支永不执行——**undo/redo 历史在跨根图树导航时永不重置**。
* 性质：`git show HEAD` 确认原 Pinia 版本同样存在此问题（本次重构忠实保留）。无测试覆盖。
> 建议：将 `const previousRootId = store.graphPath[0]` 上移到 `store.graphPath = path` 之前，并补一条"跨根图树切换重置 undo/redo 历史"的回归测试。
> 理由：这是逻辑缺陷，当前顺序使"切换到不同根图树时重置操作日志与 redo 栈"的意图失效。

### 可改进项

#### I-2：graph_store.ts 的 4 个独立 type import 可合并

* 状态：⏳ 待确认
* 位置：`frontend/src/graph/graph_store.ts:16-23`
* 现象：4 个独立的 `import type ... from '@my-project/graph-engine'` 可合并为一条。
* 影响：可读性（低）。非本次改动引入。
> 建议：合并为一条 import。
> 理由：减少冗余。

---

## 发现者:@oracle

### 审查结论

**不通过（2 项）**，经用户决策后解决：
1. **internalize.ts（GE 端）被修改**——实为用户手动改的（I-2 冗余条件重构），非 fixer 越界。oracle 评估行为等价（`abstract ⟺ childGraphId !== undefined`，原 `&& childGraphId` 是冗余守卫），GE 测试全绿佐证。**用户决策：认可并纳入契约**。
2. **B-1 修复缺回归测试**——previousRootId 修复正确，但 cleaner 建议的"跨根图树切换重置 undo/redo 历史"回归测试未补。**用户决策：接受无测试**，记录为已知缺口。

### 可改进项

#### I-3：GraphStoreAPI 接口状态字段未标 readonly

* 状态：⏳ 待确认
* 位置：`frontend/src/graph/graph_store.ts`（GraphStoreAPI interface）
* 现象：契约描述"公开 interface：只读 state"，但接口声明可写，外部调用点理论上可 `store.graphView = xxx` 绕过唯一入口。
* 影响：接口契约与文档描述不符（低）。调用点零改动约束下实际无人写。
> 建议：后续可将状态字段标 `readonly`。
> 理由：强化"唯一修改入口"契约。

#### I-4：契约"29 处测试文件"与实际 12 个文件不符

* 状态：⏳ 待确认
* 位置：`提示词/02-graph_store单例化改造/02.2-graph_store单例化改造.md`
* 现象：契约写"29 处测试文件"，实际替换 12 个测试文件（替换完整无遗漏）。
* 影响：契约文档估算偏差。
> 建议：后续提示词文件清单应 grep 全包盘点。
> 理由：避免估算偏差。

#### I-5：resetGraphStoreForTests 的引用分叉语义

* 状态：⏳ 待确认
* 位置：`frontend/src/graph/graph_store.ts`（resetGraphStoreForTests）
* 现象：置空单例后，已持有旧 store 引用的调用点（如 Graph.vue 的 graphStore 变量）不会自动切换。测试场景已用 vi.resetModules + 动态 import 处理；生产无影响。
* 影响：需在文档中记录该语义。
> 建议：记录该语义，避免误用。
> 理由：单例化后的隐藏陷阱。

---

## 发现者:@orchestrator

### 可改进项

#### I-6：非响应式状态注释区分

* 状态：✅ 已确认（已处理）
* 位置：`frontend/src/graph/graph_store.ts`（shallowReactive 对象）
* 现象：语义上非响应式状态（graphRegistry/operationLog/redoStack）搭浅响应便车（放进 shallowReactive 但不深代理），需注释区分提醒。
* 现状：已加注释分组——响应式状态（graphView/graphPath/lastValidationResult）、语义上非响应式状态（graphRegistry/operationLog/redoStack）、方法（函数不被代理）。