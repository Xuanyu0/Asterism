# 02-前端状态持有与消费方迁移

---

## 发现者:@fixer

### 需要用户确定项

#### U-1：useFloatingWindow 配套改造（范围外）

* 状态：⏳ 待确认
* 位置：`frontend/src/composables/useFloatingWindow.ts`
* 问题：fixer 实证发现 `floatingData` 的 ref 深代理会让 `.value` 读出 proxy，`{ ...proxy, label }` 的嵌套 position 仍是 proxy，structuredClone 抛 DataCloneError。因此将 `floatingData` 改为 `shallowRef`（范围外修改）。
* 影响：这是安全删除 default_tool 的 toRaw 的必要条件。
> 建议：接受配套改造。
> 理由：ref 深代理会让嵌套 proxy 泄漏进图，浅引用化是消除 toRaw 的前提。

#### U-2：preview_engine 的 cloneGraph 被内联删除

* 状态：⏳ 待确认
* 位置：`frontend/src/feature-tools/preview/preview_engine.ts`
* 问题：用户手动将 cloneGraph 函数内联删除（克隆点直接 `structuredClone(graph)`），fixer 保留内联状态避免冲突。
* 影响：结构不同于提示词描述（函数保留），功能等价。
> 建议：接受内联状态。
> 理由：功能等价，且避免与用户手动改动冲突。

#### U-3：前端 type-check 残留

* 状态：⏳ 待确认
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