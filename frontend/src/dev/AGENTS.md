> 上级入口：项目根目录的项目级 `AGENTS.md`；本文件只写本目录特有规则

# dev/ — 开发期测试工具注意事项

## 设计原则：走用户路径，不自创武功

**开发工具构造的数据，必须通过用户实际操作时使用的同一套 API 获得。**

用户创建图 → `createRootGraph`
用户加节点 → `commitToCurrentGraph([{ type: 'add_node' }])`
用户加边 → `commitToCurrentGraph([{ type: 'add_edge' }])`
用户解构 → deconstruct handler → engine compose → `commitToCurrentGraph`

`commitToCurrentGraph` 是用例层单图入口，内部经 store 唯一图操作入口 `commitBatchToGraphs` 写入；跨图场景用用例层 `commitBatches`。

❌ 自创武功——绕过运行时 API，直接拼装 GraphData 然后 `commitGraphs`：

- 跳过引擎 validate → execute → normalize 流水线
- 与用户路径不一致，无法互相验证
- 固定 ID 每次覆盖已有数据

✅ 走用户路径——`createRootGraph` → `commitToCurrentGraph` → 享用同一套幂等保护。

## bootstrap.ts：种子数据幂等性

`bootstrapDevTools()` 需在**浏览器控制台手动调用**（`main.ts` 仅加载模块以挂载 `window.bootstrapDevTools`，不随启动自动执行——避免种子注入覆盖用户上次工作图谱的恢复）。

### 核心规则

**用 `createRootGraph(title, { id })` 替代 `commitGraphs(手动拼装) + loadGraphToView`。**

```ts
// ❌ 危险——每次刷新覆盖已有数据
commitGraphs({ upserts: [手动拼装的 GraphData], deletes: [] })
graphStore.loadGraphToView(fixedId)

// ✅ 安全——createRootGraph 内置幂等检查（经导航用例层 useNavigation.createRootGraph 走 commitBatchToGraphs 统一管道）
const rootId = navigation.createRootGraph('金牌测试图', { id: 'graph-golden' as GraphId })
graphStore.loadGraphToView(rootId)
```

`createRootGraph` 接受可选的 `id` 参数——若指定 ID 且图已存在，跳过创建直接返回 ID。调用方无需手写守卫。

### 首次初始化检测

```ts
// 安全：利用空图检测首次启动
if (graphStore.graphView!.nodes.length === 0) {
  // commitToCurrentGraph 添加节点/边/子图
}
```

`createRootGraph` 创建的根图初始 `nodes: []`。`nodes.length === 0` 仅在首次启动（或用户删光所有节点）时为真——此时执行种子数据填充。

### 背景

- `commitGraphs` 是"覆盖写入"原语（`{ upserts, deletes }`）——`commitBatchToGraphs` 的持久化阶段调用 `commitGraphs`
- 种子数据需要**固定 ID**（如金图 `node-g5` 通过 `sourceGraphId: 'graph-silver'` 引用银图）
- `createRootGraph` 默认用随机 ID，加 `{ id }` 参数后同时获得固定 ID 和内置幂等保护
