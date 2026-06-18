# orbit — 环绕布局（批量初始化）

## 输入

| 参数 | 类型 | 来源 |
|------|------|------|
| `center.id` | `NodeId` | 前端用户点选的中心节点 |
| `center.position` | `NodePosition` | graph_store 当前快照中该节点的坐标 |
| `center.radius` | `number` | `nodeRadiusOverrides` 或公式 `r₀ · √(1 + degree)` |
| `satellites` | `{ id: NodeId, radius: number }[]` | 前端用户框选的卫星节点列表；radius 同上来源 |
| `tierCount` | `number` | 前端根据当前图谱最大层级 + 1 计算（手动挡），或按光标可及范围算（自动挡） |
| `allNodes` | `NodeData[]` | graph_store 当前快照 |
| `allEdges` | `EdgeData[]` | graph_store 当前快照 |
| `nodeRadiusOverrides` | `NodeRadiusMap` | 前端预计算的半径覆盖表 |

## 调用场景

| | |
|---|---|
| 调用方 | 前端 `operation_controller` |
| 频率 | 一次性——用户选中卫星后点"环绕布局"按钮时调用 |
### 路径 1：直接确认

```
orbit() → 用户预览 drafts → 确认 → applyBatch(graph, result.operations)
```

最简路径。用户对 orbit 产出的批量草稿无异议，点确认直接提交。

### 路径 2：确认前微调

```
orbit()
    ↓
用户预览 drafts（前端渲染）
    ↓ 用户拖拽某个卫星
adjustOrbit() per-frame 对单个卫星吸附 → 前端用新 draft 替换旧预览
    ↓ 用户松手
合并 operations 提交：
    applyBatch(graph, [
        ...orbitResult.operations 中除被微调节点以外的,
        ...adjustOrbitResult.operations,
    ])
```

路径 2 依赖调用方手动合并 `operations`——`orbit()` 和 `adjustOrbit()` 各自产出完整的 `ComposeResult`，引擎不自动合并。合并逻辑在前端 `operation_controller` 中。

### 已知限制

确认前微调（路径 2）存在碰撞检测盲区：

- `orbit()` 的碰撞检测用 `hasCollisionInDrafts`，覆盖草稿互碰 + 草稿 vs 已有节点。
- `adjustOrbit()` 的碰撞检测用 `hasCollisionAt`，只覆盖单草稿 vs 已有节点，**不感知未提交的同伴草稿**。

若 `orbit()` 把节点 B 移到了节点 A 的微调路径附近，`adjustOrbit(A)` 的 `hasCollisionAt` 看到的是 B 的旧位置（GraphData 中尚未更新），无法检测出 A 的新位置与 B 的未提交草稿之间的冲突。

**对用户的影响**：确认前微调后点确认 → `applyBatch` 执行 merged operations → 节点已落定到新位置，不再需要二次碰撞检测。碰撞盲区只影响**预览阶段的按钮状态**（可能亮但实际上落定后有轻微重叠），不影响最终执行结果。

**未来改进方向**：为 `adjustOrbit` 添加可选的 `peerDrafts` 参数，在碰撞检测时同时检查未提交的同伴草稿位置。

## 前置条件

### error（阻塞确认，按钮灰掉）

| 条件 | 校验方式 | 错误消息 |
|------|---------|---------|
| 卫星与中心之间不存在实边（`kind === 'real'`） | 遍历 `allEdges`，`Array.some()` 检查是否存在连接 center 和 satellite 的实边（有向或无向） | `节点 ${satellite.id} 与中心节点 ${center.id} 之间不存在实边，不能参与环绕布局。` |
| 卫星节点不在 `allNodes` 中 | 遍历 `allNodes` 构建 `Map<id, position>`，`map.get(satellite.id)` 为 `undefined` | `节点 ${satellite.id} 在当前图谱中不存在。` |
| 草稿位置与已有节点碰撞，或草稿之间互碰 | `hasCollisionInDrafts(drafts, allNodes, nodeRadiusOverrides)` 返回 `true` | `部分卫星草稿位置与已有节点碰撞，无法放置。` |

### warning

无。当前无 warning 级别的条件。

## 返回值

- **drafts 数量**：等于 `satellites.length`。每个卫星一条 `DraftPosition`，不含扩展字段（与 `adjustOrbit` 返回的 `DraftOrbitPosition` 不同——初始化不需要前端展示 tier/angle）。
- **issues 典型清单**：见上方"前置条件"中的三条 error 消息。
- **operations 数量**：等于 `drafts.length`（不含碰撞失败的节点——碰撞导致统一 error 阻挡确认，不逐条剔除）。

## 后置影响（图结构变化）

### 父图

- **节点**：无增删。已有节点的 `position` 被 `move_node` 更新。
- **边**：无变化。

### 子图 / 常识层

不涉及。

## applyBatch 得到的原子操作序列

全部为 `move_node`，数量等于卫星数。无跨图操作，全部属于同一事务。

```
1. move_node  nodeId=<satellite[0].id>  position=<snapped[0]>
2. move_node  nodeId=<satellite[1].id>  position=<snapped[1]>
...
N. move_node  nodeId=<satellite[N-1].id>  position=<snapped[N-1]>
```

执行顺序无依赖（互不引用对方的旧位置——碰撞检测已在 compose 层完成，执行时不再重复）。

## 事务语义

| | |
|---|---|
| 原子性边界 | 全部 N 条 `move_node` 构成一个事务。任一 `validate` 失败则整批丢弃，`graph` 原封不动 |
| dryRun 行为 | 与默认行为一致——逐条 validate，全通过后跳过 execute，返回校验结果。无特殊语义 |
| 幂等性 | 是。重复调用同一输入（节点位置未变）产出相同的 `drafts` / `operations`，再次执行不改变结果。节点已被移动到轨道上后再次调用 → `snapOrbit` 在相同位置上吸附到同一层级，位置不变 |
| 可逆性 | 是。`createReversal` 可对每条 `move_node` 构造逆操作（记录旧位置）。Ctrl+Z 恢复到布局前位置 |

## 位置安排策略

### 层级间距 D₀

```ts
D₀ = centerRadius + maxSatelliteRadius + r₀
```

由 `computeTierSpacing(center.radius, satellites.map(s => s.radius))` 计算。

层级 n 的轨道半径 = `(n + 1) · D₀`。约束保证：
- **A（中心 ↔ 层级 0）**：D₀ ≥ centerRadius + maxSatelliteRadius + r₀，中心与最内圈卫星不碰。
- **B（层级间）**：centerRadius ≥ maxSatelliteRadius → D₀ 定义自动满足层间间距。

### 逐节点吸附

每个卫星使用 `snapOrbit(center.position, currentPosition, D₀, tierCount)`：

1. 角度 = `atan2(currentPos.y - center.y, currentPos.x - center.x)`——保留节点当前方向。
2. 层级 = `argmin_n |当前距离 - (n+1)·D₀|`——吸附到距离最近的离散轨道。
3. 位置 = `positionOnCircle(center, (tier + 1)·D₀, angle)`。

### 已有节点位置

卫星被移动到吸附后的轨道位置。中心节点不动。非参与节点不动。

### 碰撞检测

`hasCollisionInDrafts` 双重检测：
1. 草稿 vs 草稿——两两之间以各自外接圆半径判定。
2. 草稿 vs 已有节点——逐个调 `hasCollisionAt`，同时传入同伴 ID 作为排除项（移动中节点的旧位置不应触发碰撞）。
