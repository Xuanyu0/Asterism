# 05-graph_store核心化与生命周期适配层下沉

---

## 发现者:@fixer

### 不确定事项

#### U-1：dev/AGENTS.md 文档示例失效

* 状态：✅ 已处理（提交 5b6f3a7 更新 AGENTS.md 示例与触发说明）
* 位置：`frontend/src/dev/AGENTS.md:33`（及 L7/L17/L25/L37/L48/L54 归属表述）
* 问题：示例代码仍为 `graphStore.createRootGraph('金牌测试图', { id: ... })`，store 已移除该方法。属 agent 指引文档，按文档修改规则需用户明确许可，本次未修改。
> 建议：用户许可后改为 `useNavigationAdapter().createRootGraph(...)`（与 bootstrap.ts 实际接线一致），并同步其余归属表述。

#### U-2：Graph.vue 错误面板 $el 语义

* 状态：✅ 可接受（oracle 裁决，不回流）
* 位置：`frontend/src/views/Graph.vue`（errorPanelRef + pointerdown 监听）
* 问题：面板不可见时 `$el` 为 Transition 注释节点（非 HTMLElement），此时点击任意处会调 `clearValidationResult()`。
* 影响：此时 lastValidationResult 要么为 null、要么 valid 无 error issues，清空无信息损失。代码注释已显式记录该行为。

#### U-3：restoreLastRootTree corrupted 路径行为变更

* 状态：✅ 与契约一致（oracle 裁决，通过）
* 位置：`useLifecycleAdapter.ts`（restoreLastRootTree）
* 问题：原 initRegistry 对 corrupted 只报告不清理 lastActiveRootId；新行为按契约要求 corrupted / missing / kind 非 root 均清理。测试已断言。

---

## 发现者:@cleaner

### 可改进项（已处理）

#### I-1：Graph.vue import 分组违规

* 状态：✅ 已确认（已处理）
* 位置：`frontend/src/views/Graph.vue`
* 现象：新增 `import type { ComponentPublicInstance }` 插在 value import 与 type import 之间、无空行分隔。
* 现状：已补空行（符合"每组空一行 / type 与普通 import 不混组"）。

#### I-2：graph_store.test.ts 头部注释缩进回归

* 状态：✅ 已确认（已处理）
* 位置：`frontend/src/graph/graph_store.test.ts`
* 现象：改写后注释续行丢失缩进对齐。
* 现状：已恢复续行缩进。

### 可改进项（待定）

#### I-3：空根图创建重复模式

* 状态：✅ 不抽取（oracle 裁决，记录为改进点）
* 位置：`useNavigationAdapter.createRootGraph` 与 `useLifecycleAdapter.ensureWorkspaceRoot`
* 现象：两处重复"构造空根图 + add_graph 统一管道"（约 10 行）。
* 裁决：语义不同（生命周期兜底 vs 用户/种子显式创建），跨适配层委托违反单向依赖，抽取收益低于抽象成本。若未来出现第三个创建点，再抽取为 `graph/utils/` 纯函数工厂。

#### I-4：NotificationPanel closable 死代码

* 状态：⏳ 待确认
* 位置：`frontend/src/components/NotificationPanel.vue`（closable prop、close emit、关闭按钮、.notification-panel-close CSS）
* 现象：重构后全库无 `<NotificationPanel closable>` 消费者。通用组件能力，移除属共享组件逻辑变更。
> 建议：确认无未来复用计划后移除（独立清理项）。

#### I-5：注释风格不一致

* 状态：⏳ 待确认
* 位置：`useLifecycleAdapter.ts` / `useNavigationAdapter.ts`（新写 TSDoc vs 同接口既有散文体）
* 现象：新写方法用 TSDoc 标签（@remarks/@param/@returns），同文件既有方法用"说明：/ 参数：/ 返回："散文体。
> 建议：后续统一（低优先级）。

#### I-6：restoreLastRootTree 内 registry 引用重复

* 状态：✅ 已处理（用户检查阶段已 hoist 为局部变量）
* 位置：`useLifecycleAdapter.ts`
* 现象：`useGraphStore().graphRegistry` 出现 3 处，可 hoist 为局部变量。
> 建议：可读性优化（可选）。

---

## 发现者:@oracle

### 审查结论

**通过**（9 项验收标准 8 项通过；1 项字面未达成——vue-tsc 既有技术债，非本次回归）。变更边界全部遵守（GE 端零改动、commitBatchToGraphs 内部零改动、deleteRootGraphTree 未动、无直接 saveGraph/registerGraph 创建、无新依赖）。

### 待决问题裁决

| 问题 | 裁决 |
|------|------|
| 空根图创建重复模式（cleaner I-3） | 不抽取，保持现状；第三个创建点出现时再抽取 |
| NotificationPanel closable 死代码 | 建议移除（独立清理项，非必须回流） |
| dev/AGENTS.md 示例失效（fixer U-1） | 需用户许可后更新（运行时无影响，纯文档） |
| Graph.vue 错误面板 $el 语义（fixer U-2） | 可接受，不修正 |
| corrupted 路径清理 lastActiveRootId（fixer U-3） | 与契约一致，无副作用 |

### 问题列表

#### I-7：vue-tsc 既有错误（非本次回归）

* 状态：⏳ 待确认
* 位置：`frontend/src/cytoscape/mapper-utils/class_mapper.ts:27`
* 现象：`node.form` 属性不存在（GE 类型已移除 form 字段）。HEAD 即存在，属步骤 03"派生值分离"的技术债，本次验收标准 9 字面未达成。
> 建议：步骤 03 处理 class_mapper 时改接 deriveNodeForm（02.2 提示词已豁免）。

#### I-8：工具通知面板与错误面板双面板点击语义

* 状态：⏳ 待确认（低风险）
* 位置：Graph.vue 错误面板外部点击清错
* 现象：工具通知面板与错误面板同时可见时，点击工具面板也会清错——按"外部交互即关闭"语义推断一致，但 L1 设计文档未明确覆盖双面板场景。
> 建议：当前可接受，若未来出现误清场景再细化。

---

## 发现者:@orchestrator（用户检查阶段）

### BUG

#### U-4：bootstrap 种子注入覆盖 lastActiveRootId（恢复图谱被劫持）

* 状态：✅ 已处理（提交 5b6f3a7，方案 D：手动触发）
* 位置：`frontend/src/dev/bootstrap.ts`（3 处 loadGraphToView）+ `frontend/src/main.ts`
* 现象：bootstrapDevTools 每次应用启动自动执行，3 次切图均触发 saveLastActiveRootId，使 restoreLastRootTree 每次启动恢复的都是金图——"恢复上次工作图谱"被 dev 种子逻辑劫持（既有行为，本次重构使其显性化）。
* 处理：bootstrap 改为浏览器控制台手动触发（main.ts 仅副作用加载并挂载 window.bootstrapDevTools）；恢复功能不再被种子污染。
