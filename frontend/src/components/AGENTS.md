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
- **子组件决不做决策层操作**：不导入 `graphStore` 写方法、不导入 `operationController`、`toolMediator` 等编排模块。所有对 store 的写入（`loadGraphToView`、`applyBatchToGraph`、`createRootGraph`、`deleteRootGraphTree` 等）必须经由 emit → 父组件处理。

### 已知技术债务

`NavigationPanel.vue` 中 `createRootGraph` 和 `deleteRootGraphTree` 直接在子组件中调用了 store 写方法，而非通过 emit。原因是这两个操作不涉及副作用编排，且子组件需要获取返回值（新 graphId）。

**约束**：此类例外应极少。写 store 前确认：是否存在父组件需要做的编排？是 → 必须走 emit；否 → 可以读 store，但写入 store 仍应优先走 emit。

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
<Dock
    v-bind:path-segments="pathSegments"
    v-on:go-parent-graph="goUpOneLevel"
/>
```
