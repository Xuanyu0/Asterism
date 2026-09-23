> 上级入口：项目根目录的项目级 `AGENTS.md`；本文件只写本目录特有规则

## 组件间职责划分：「数据向下流，事件向上流」

### 规则

```
父组件（拥有数据 + 决策逻辑）
    │  props ↓（数据，只读）
    │
子组件（拥有渲染 + 内部管理状态）
    │  emits ↑（信号）
    │
父组件（收到信号，决策并处理）
```

- **数据向下流**：父组件从 store 读取数据，派生为子组件需要的视图模型，通过 props 传给子组件。子组件只读使用，不修改、不写 store。
- **事件向上流**：用户与子组件交互时，子组件通过 emit 发送信号（事件名 + 载荷）。父组件监听事件，决定如何处理（包括写 store）。
- **子组件决不做决策层操作**：不导入 store 写入口（`commitBatchToGraphs`）与编排模块；写入经 emit 或已确立的用例层入口。

### 只读 vs 写入

- **只读门面 / 只读 store（允许）**：读取 store 或用例层派生状态，不产生写入。
- **写 store / 编排（须经 emit）**：触发 GraphData 写入或工具编排，应由父组件统一处理。
- 判定模板：「是否存在父组件需要做的编排？」是 → 必须走 emit；否 → 允许读 store，但写入仍优先走 emit。

### 已知技术债务

`NavigationPanel.vue` 经 `graph/use-case/useNavigation` 的 `useNavigation()` 调用 `createRootGraph` / `deleteGraphTree`，未走 emit → 父组件链路。

### 现状：例外边界（边界待定）

以下组件当前未完全走 emit 链路。仅记录现状，边界设计尚未裁决，不代表已认可：

- `NavigationPanel.vue`：直接调用导航用例层 `createRootGraph` / `deleteGraphTree`（见上「已知技术债务」）。
- `GraphModeSelector.vue`：直接 import 编排模块 `operationController` 与 `mediator`。
- `GraphFloatingWindow.vue`：读 `mediator.defaultHandler`，并调用活跃 handler 的浮空窗回调。
- `GraphNavigationCard.vue`：使用 `mediator` 与导航用例层 `goToGraph`。
- `GraphPermanentToolbar.vue`：使用 `mediator` 注册 / 激活 / 取消工具。
- `SearchPanel.vue`：只读 store（属「只读 store」，仅作对照）。

---

## Props / Emits 命名规则

### 规则

```
声明（defineProps / defineEmits）→ camelCase
模板（v-bind / v-on）         → kebab-case
```

Vue SFC 编译器自动将模板中的 kebab-case 映射到声明中的 camelCase。

#### 示例

```ts
// 子组件声明：camelCase
const props = defineProps<{
  pathSegments: PathSegment[]
}>()

// 子组件声明：camelCase，无引号
const emits = defineEmits<{
  goParentGraph: []
}>()
```

```vue
<!-- 父组件模板：kebab-case，编译器自动映射 -->
<Dock v-bind:path-segments="pathSegments" v-on:go-parent-graph="goUpOneLevel" />
```
