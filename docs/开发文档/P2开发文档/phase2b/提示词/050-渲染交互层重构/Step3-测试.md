# Step 3：move_node 状态机单测

> 来源：[050-步骤-渲染交互层重构.md](../../../P2开发文档/phase2b/步骤/050-渲染交互层重构.md) §Step 3

---

## 设计文档依据

- `CLAUDE.md` §架构分层：Cytoscape 只是 Renderer，GraphData 是唯一事实源
- `CLAUDE.md` §两个 Pinia Store：graphStore 持有 GraphData，不持有 Cy 状态
- [050-步骤-渲染交互层重构.md](../../../P2开发文档/phase2b/步骤/050-渲染交互层重构.md) §Step 2 已完成——move_node 的视觉预览走 renderer 语义接口，不再直接依赖 Cy 实例
- [050-步骤-渲染交互层重构.md](../../../P2开发文档/phase2b/步骤/050-渲染交互层重构.md) §Step 3 已确定决策：
    - Mock renderer API，不 mock engine
    - 测试文件位置：`src/feature-tools/toolbar/move-node.test.ts`
    - Mock 策略：`vi.mock('@/cytoscape/useRenderer')` 拦截 `useRenderer()` 返回
    - 测试数据：复用 `createGoldenTestGraphV2()` 金牌图
    - 断言使用 `test()`，不用 `it()`
    - vitest `globals: true` 已启用——`test` / `describe` / `expect` / `beforeEach` / `vi` 均为全局函数，测试文件中**无需** `import` vitest 相关函数

---

## 当前状态

`frontend/src/feature-tools/toolbar/move_node.ts`（317 行）实现了 `useMoveNodeTool(): ToolHandler`，内部维护拾取放置状态机。

**依赖关系**：

```
move_node.ts
    ├── useGraphStore()          → graphStore（Pinia，jsdom 下正常）
    ├── useRenderer()            → 6 个渲染方法（内部持有 Cytoscape 实例，jsdom 下不可用）
    ├── composeMoveNode()        → 引擎纯函数（jsdom 下正常）
    ├── computeNodeRadiusOverrides() → 纯函数（jsdom 下正常）
    └── hasErrors()              → 纯函数（jsdom 下正常）
```

**唯一需要 mock 的边界**：`useRenderer()` —— Cytoscape 需要 Canvas API，jsdom 不支持。

**现有测试模式**（参考 `add-edge.test.ts`）：

```ts
beforeEach(() => {
    setActivePinia(createPinia()) // 重置 Pinia
    localStorage.clear() // 清空持久化
    const golden = createGoldenTestGraphV2() // 构造金牌图
    saveGraph(golden) // 持久化
    const store = useGraphStore()
    store.loadGraphToView(golden.id) // 加载到视图
})
```

move_node 测试需要在此基础之上增加 `vi.mock('@/cytoscape/useRenderer')` 拦截 renderer。

**金牌图节点坐标**（用于选择测试节点和构造无碰撞放置位置）：

| 节点 ID   | label     | 位置 (x, y) |
| --------- | --------- | ----------- |
| `node-g1` | 知识节点A | (50, 200)   |
| `node-g2` | 知识节点B | (350, 200)  |
| `node-g3` | 抽象节点  | (650, 200)  |
| `node-g4` | 虚节点    | (950, 200)  |
| `node-g5` | 跳转银牌  | (50, 500)   |
| `node-g6` | 知识节点C | (350, 500)  |

---

## 具体子任务

### 1. 创建 `move-node.test.ts` + 搭建 mock renderer 基础设施

**文件**：`frontend/src/feature-tools/toolbar/move-node.test.ts`

**Mock 要求**：

`vi.mock('@/cytoscape/useRenderer')` 拦截模块，`useRenderer()` 返回 mock 对象。关键约束：

- **trackCursor 暴露回调句柄**：mock 实现将传入 callback 保存到模块级变量，测试手动调用以模拟光标移动。
- **getNodePosition 对已知节点返回正确位置**：测试中传入的 nodeId 若对应金牌图已有节点，返回其已知坐标；否则返回 null。
- **其他方法用 `vi.fn()`**：`setNodePosition`、`addNodeClass`、`removeNodeClass`、`resetNodePosition`、`clearAllPreviews` 均为 `vi.fn()`（空实现，无副作用）。
- **每次测试前重置**：`beforeEach` 中 `vi.clearAllMocks()` 确保 mock 调用记录隔离。

**trackCursor mock 参考**：

```ts
let capturedCallback: ((pos: { x: number; y: number }) => void) | null = null

const mockTrackCursor = vi.fn((cb: (pos: { x: number; y: number }) => void) => {
    capturedCallback = cb
    return { stop: vi.fn() }
})
```

`vi.mock()` 需放在文件顶部（import 之前），vitest 会自动提升。

**测试骨架**（与现有测试一致）：

- 顶层 `beforeEach`：Pinia 重置 + localStorage 清空 + 金牌图加载
- 每个 `describe` 块的 `beforeEach`：`vi.clearAllMocks()` + 创建 handler + `handler.activate()`
- 所有断言用 `test()`（不用 `it()`）

### 2. 测试 activate / deactivate 生命周期

验证 `useMoveNodeTool()` 创建的 handler 在 activate 和 deactivate 时的公开契约输出。

需要覆盖：

**activate**：

- `test('激活后 isActive 为 true')`：`handler.activate()` → `expect(handler.isActive).toBe(true)`
- `test('激活后 cursorClass 为 cursor-crosshair')`：`handler.activate()` → `expect(handler.cursorClass).toBe('cursor-crosshair')`
- `test('激活后 trackCursor 被调用')`：`handler.activate()` → `expect(mockTrackCursor).toHaveBeenCalledTimes(1)`
- `test('激活后 notification 为 null')`：未拾取、无碰撞 → `expect(handler.notification).toBeNull()`

**deactivate**：

- `test('deactivate 后 isActive 为 false')`：`handler.deactivate()` → `expect(handler.isActive).toBe(false)`
- `test('deactivate 后 cursorClass 为 null')`：`handler.deactivate()` → `expect(handler.cursorClass).toBeNull()`
- `test('deactivate 后 trackCursor stop 被调用')`：在 `capturedCallback` 可用前调用 `handler.deactivate()`，验证 `tracking.stop` 被调。
- `test('deactivate 重置后再次 activate 状态正确')`：验证 activate → deactivate → activate 循环后 `isActive`、`cursorClass` 均正确。

### 3. 测试 idle → picked 状态转换（onNodeClick）

**前置**：handler 已 activate，处于 idle 状态。

**getNodePosition mock**：需对金牌图已知节点返回正确坐标（如 `'node-g1'` → `{ x: 50, y: 200 }`），使其通过位置检查。

需要覆盖：

- `test('onNodeClick 拾取节点后 isPicked 状态反映'）`：无法直接读 `isPicked`（私有变量），通过**可观测的公开契约**验证——拾取后 `cursorClass` 变化、`addNodeClass` 被调用。
- `test('onNodeClick 拾取后 addNodeClass move-picked 被调用')`：`handler.onNodeClick!('node-g1')` → `expect(mockAddNodeClass).toHaveBeenCalledWith('node-g1', 'move-picked', 'move')`
- `test('onNodeClick 拾取后 setNodePosition 吸附到当前光标位置')`：先手动触发 `capturedCallback({ x: 300, y: 400 })` 更新 `lastModelPos`，再 `handler.onNodeClick!('node-g1')` → `expect(mockSetNodePosition).toHaveBeenCalledWith('node-g1', { x: 300, y: 400 })`
- `test('未激活时 onNodeClick 不触发拾取')`：不调 activate，直接 `handler.onNodeClick!('node-g1')` → `expect(mockAddNodeClass).not.toHaveBeenCalled()`

### 4. 测试 picked → idle 放置成功（无碰撞）

**前置**：handler 已 activate 且已进入 picked 状态（调过 `onNodeClick`）。

**碰撞规避**：选择一个远离所有金牌图节点的位置（如 `{ x: 2000, y: 2000 }`），确保真实 `composeMoveNode` 不产生碰撞 issue。

**getNodePosition mock** 在 picked 状态下需要从 renderer 返回当前预览位置（即 `setNodePosition` 最后设置的值），测试中 mock 应维护一个简单的 `Map<nodeId, position>` 内部状态来模拟此行为。

需要覆盖：

- `test('无碰撞放置后 applyBatchToGraph 被调用')`：`handler.onCanvasClick!({ x: 2000, y: 2000 })` → 验证 `graphStore.graphView` 中节点位置已更新。
- `test('无碰撞放置后 removeNodeClass move-picked 被调用')`：放置成功后 `expect(mockRemoveNodeClass).toHaveBeenCalledWith('node-g1', 'move-picked', 'move')`
- `test('无碰撞放置后 isActive 仍为 true（工具未停用）')`：放置成功后 `expect(handler.isActive).toBe(true)`
- `test('无碰撞放置后 cursorClass 回到 cursor-crosshair')`：回到 idle 待拾取状态 → `expect(handler.cursorClass).toBe('cursor-crosshair')`
- `test('无碰撞放置后 notification 为 null')`：`expect(handler.notification).toBeNull()`

### 5. 测试 cancelPick（弹回）

**前置**：handler 已 activate 且已 picked。

`cancelPick` 的触发路径：notification 的 `onCancel` 回调。测试通过 `handler.notification.onCancel()` 调用来模拟右键取消。

需要覆盖：

- `test('cancelPick 调用 resetNodePosition')`：`handler.notification!.onCancel()` → `expect(mockResetNodePosition).toHaveBeenCalledWith('node-g1')`
- `test('cancelPick 调用 clearAllPreviews move')`：`expect(mockClearAllPreviews).toHaveBeenCalledWith('move')`
- `test('cancelPick 后 cursorClass 回到 cursor-crosshair')`：回到 idle → `expect(handler.cursorClass).toBe('cursor-crosshair')`
- `test('cancelPick 后 notification 为 null')`：`expect(handler.notification).toBeNull()`
- `test('deactivate 在 picked 状态时触发弹回')`：`handler.deactivate()` → 验证 `mockResetNodePosition` + `mockClearAllPreviews` 被调用（cancelPick 逻辑已被 Step 2 修正到 deactivate 的统一路径中）

### 6. 测试 cursorClass / notification 计算属性

`cursorClass` 和 `notification` 是 `computed` 属性，只读、反应式。验证不同状态下的输出：

**cursorClass**：

- `test('未激活时 cursorClass 为 null')`：不调 activate → `expect(handler.cursorClass).toBeNull()`
- `test('激活且未拾取时 cursorClass 为 cursor-crosshair')`：activate 后、未 onNodeClick → `expect(handler.cursorClass).toBe('cursor-crosshair')`

**notification**：

- `test('未激活时 notification 为 null')`：不调 activate → `expect(handler.notification).toBeNull()`
- `test('激活且未拾取时 notification 为 null')`：activate 后 → `expect(handler.notification).toBeNull()`

> 注：碰撞阻断（collision message 导致 notification 非 null）和 trackCursor 回调内逻辑暂不纳入本轮——前者依赖金牌图坐标构造精确碰撞场景，后者涉及 mock 回调手动触发含引擎碰撞的完整路径。

---

## 新增/修改文件

| 文件                                                   | 职责                     | 操作     |
| ------------------------------------------------------ | ------------------------ | -------- |
| `frontend/src/feature-tools/toolbar/move-node.test.ts` | move_node 状态机单元测试 | **新增** |

**不修改的文件**（红线）：

- `move_node.ts`（源码）
- `useRenderer.ts`、`graph_element_mapper.ts`、`cytoscape_style.ts`、`graph_interaction.ts`（renderer 层）
- `graph_store.ts`、`ui_store.ts`（Pinia store）
- `mediator.ts`、`types.ts`（交互逻辑层）
- 任何其他测试文件

---

## 变更边界

**禁止修改**：

- `move_node.ts` 源码（包括但不限于：导出额外内部状态供测试读取、将私有变量改为 ref、添加 test-only 函数）
- `useRenderer.ts`（包括：添加 mock 专用接口、暴露内部状态）
- 任何 `feature-tools/toolbar/` 下的其他源文件
- 任何 `cytoscape/` 下的源文件
- 现有测试文件
- `vitest.config.ts`

**允许**：

- 在 `move-node.test.ts` 内部使用 `vi.mock()`、`vi.fn()`、`vi.clearAllMocks()`
- 在测试中调用 `handler.notification.onCancel()` 触发 cancelPick 路径
- 在测试中手动调用 `capturedCallback()` 模拟光标移动
- 在 mock `useRenderer` 中维护内部状态模拟 `getNodePosition` 的返回值

**Mock 隔离要求**：

- `vi.mock('@/cytoscape/useRenderer')` 的 mock 实现仅影响 `move-node.test.ts`，不影响其他测试文件
- 每个 `test()` 用例独立——`beforeEach` 中 `vi.clearAllMocks()` + 重新创建 handler

---

## 验收标准

- [ ] `frontend/src/feature-tools/toolbar/move-node.test.ts` 文件存在
- [ ] 所有断言使用 `test()`，不使用 `it()`
- [ ] `vi.mock('@/cytoscape/useRenderer')` 拦截 `useRenderer()`，各项 renderer 方法为 `vi.fn()`
- [ ] `trackCursor` mock 暴露回调句柄，支持测试手动触发
- [ ] `getNodePosition` mock 对金牌图已知节点返回正确坐标
- [ ] activate 生命周期：`isActive`、`cursorClass`、`trackCursor` 调用验证
- [ ] deactivate 生命周期：`isActive` 重置、tracking stop 调用验证
- [ ] idle → picked：`addNodeClass('move-picked', 'move')` 调用、`setNodePosition` 吸附
- [ ] picked → idle 无碰撞放置：`applyBatchToGraph` 写入成功、`removeNodeClass` 清理、状态回归
- [ ] cancelPick：`resetNodePosition` + `clearAllPreviews('move')` 调用验证
- [ ] cursorClass / notification 计算属性各状态输出正确
- [ ] `pnpm --filter frontend test` 全部通过（含新增用例 + 已有 6 个测试文件不受影响）
- [ ] 每个测试独立——单独运行任一 test 均通过

---

## subagent task 返回要求

完成后返回：

1. 测试文件完整路径
2. 用例清单（每个 `test()` 一句说明 + 覆盖的状态转换/公开契约）
3. mock `useRenderer` 的内部实现说明（getNodePosition 的坐标映射逻辑、trackCursor 回调捕获机制）
4. `pnpm --filter frontend test` 运行结果（通过/失败 + 失败用例详情）
5. 执行过程中遇到的任何问题或不确定项
