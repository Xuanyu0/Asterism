# Nesso 分析：产品定位、架构、原创性对比

> 项目地址：[github.com/nesso-how/nesso](https://github.com/nesso-how/nesso)
> 调研时间：2026 年 7 月，版本 v0.1.0-alpha.41

---

## 一、产品定位

### 官方定位

> **"An app for building typed knowledge graphs for active learning."**
> — README 第一行

> **"Nesso is not a note-taking app."**
> — 文档 Introduction

> **"The learner constructs their own knowledge structure: a typed concept graph that reflects how they understand, not just what they have consumed."**
> — 文档 Philosophy

### 与 Asterism 的定位对比

```
管理知识内容                       管理理解过程                      管理学习状态
─────────────────────────────────────────────────────────────────────────────→
Obsidian/Roam    Heptabase/Scrintal    Nesso    Asterism
                                        ↑        ↑
                                   "主动学习"    "学习状态的形式化表示"
                                   语义图+FSRS    认知操作+图引擎
```

| 维度 | Nesso | Asterism |
|------|-------|----------|
| **标语** | "构建带类型知识图谱用于主动学习" | "管理学习者与知识之间的学习状态" |
| **图谱是什么** | **学习辅助工具** — 构建 → 复习 → 记忆 | **形式化的状态表示** — 操作改变认知状态 |
| **学习理念** | 类型化边选择 = 精细加工（elaborative processing），"the decision is the learning" | 认知操作（解构/归纳/内化/发散）= 理解结构的形式化变换 |
| **目标用户** | 主动学习者，技术素养较高 | 学习者/研究者，愿意结构化思考 |
| **核心差异** | 产品围绕"选择关系类型 + 间隔重复记忆"设计 | 产品围绕"形式化图转换 + 操作撤销树"设计 |

**结论**：Nesso 是现有产品中定位最接近 Asterism 的，两者都明确说"不是笔记应用"。差异在于路径——Nesso 走**语义丰富性 + 间隔重复**路线，Asterism 走**形式化操作 + 认知结构变换**路线。

---

## 二、功能对比

| 功能 | Nesso | Asterism |
|------|-------|----------|
| **类型化边** | ✅ **52 种**，8 类别，含逆/传递/强度/极性/基数属性 | ✅ `EdgeKind`（实/虚/参考）× `Direction`（有向/无向），组合式 |
| **节点类型** | ❌ 单一类型 `ConceptNodeData`（文本+FSRS） | ✅ `NodeRole` 判别联合（知识/引用→原子/抽象→沟通/启发） |
| **认知操作**（解构/归纳/内化/发散） | ❌ **无**。只有 CRUD | ✅ **核心功能**，Engine compose/ |
| **布局操作**（环绕/路径/碰撞检测） | ❌ **无**。只有 React Flow 原生拖拽 | ✅ **有**，Engine compose/arrangement/ |
| **折叠/展开** | ❌ 无 | ✅ 有 |
| **间隔重复（FSRS）** | ✅ **核心功能**，`ts-fsrs`，独立 IndexedDB 存储 | ❌ 无 |
| **AI 导师** | ✅ **已发布**，苏格拉底 AI，图谱上下文注入 | ⏳ Phase 4 规划中 |
| **MCP 服务器** | ✅ **已发布**，`@nesso-how/mcp` | ❌ 无 |
| **撤销/重做** | ✅ 线性快照栈，50 步上限 | ✅ 线性快照栈（引擎可计算逆操作） |
| **分支撤销** | ❌ 无（新操作清除 future） | ⏳ 设计中有但未全实现 |
| **多图谱** | ✅ 通过项目文件夹/IndexedDB | ✅ 通过 graph_registry |
| **持久化** | IndexedDB + 桌面 .json 文件 | localStorage（当前） |
| **可嵌入图谱组件** | ✅ `@nesso-how/graph` 只读 React 组件 | ❌ 无 |
| **桌面端** | ✅ Tauri v2 | ❌ 纯 Web |
| **本地优先** | ✅ 无需后端 | ✅ |
| **npm 包发布** | ✅ 5 个包（schema/vocab-learning/theme/graph/mcp） | ✅ 1 个内部引擎包 |

---

## 三、架构对比

### 技术栈

| 层 | Nesso | Asterism |
|----|-------|----------|
| **框架** | React 18 | Vue 3 |
| **状态管理** | Zustand 5（单 store，5 个 slice）+ persist | Pinia（graph_store + ui_store） |
| **画布** | React Flow（`@xyflow/react` v12） | Cytoscape.js 3.33 |
| **构建** | Vite 6 | Vite |
| **桌面** | Tauri v2 (Rust) | 无 |
| **包管理** | pnpm monorepo | pnpm monorepo |
| **间隔重复** | `ts-fsrs` | 无 |
| **AI** | `ai` + `@ai-sdk/openai-compatible` | 无（Phase 4） |
| **测试** | Vitest + Playwright + Stryker | Vitest |

### 架构分层对比

```
Nesso:
用户交互 (DOM/Keyboard)
    ↓ 直接调用 store action
Zustand Store (5 slices)
    ├── graph-editing slice    — CRUD + undo/redo (与 React Flow 耦合)
    ├── graph-management slice — 图谱生命周期 (IndexedDB)
    ├── settings slice         — 设置
    ├── ui slice               — UI 状态
    └── desktop-sync slice     — 文件冲突
    ↓                          (无独立引擎层)
React Flow Canvas (@xyflow/react)
    ↓
IndexedDB + .json 文件

---

Asterism:
用户交互 (DOM)
    ↓
交互逻辑层 (feature-tools/)
    ├── mediator.ts            — 工具注册/激活/互斥
    ├── toolbar/               — handler (add-node, add-edge, delete, fold)
    └── cognition/             — handler (deconstruct)
    ↓  事件路由 via mediator
Runtime (graph/)
    ├── graph_store.ts         — Pinia store
    ├── graph_persistence.ts   — localStorage
    └── graph_registry.ts      — 多图注册表
    ↓  委托纯函数
GraphEngine (@my-project/graph-engine) — 框架无关
    ├── core/                  — validate / execute / replay / reversal
    ├── compose/               — cognitive + arrangement
    └── infrastructure/        — 碰撞检测 / 放置 / 搜索
    ↓  watch(currentGraph)
渲染投影层 (render/)
    ├── graph_element_mapper.ts  — GraphData → CyElements (只读)
    ├── cytoscape_style.ts       — 样式配置
    └── use_graph_interaction.ts — 事件 → 语义事件
    ↓  CyElements
Cytoscape Renderer (只读投影)
```

### 八大架构维度对比

| 维度 | Nesso | Asterism |
|------|-------|----------|
| **数据模型** | 单节点类型 + 52 种命名边类型，FSRS 参数嵌入节点 | 判别联合 NodeRole，EdgeKind × Direction 组合式 |
| **数据流** | Flux 风格（store action → state → re-render） | 严格单向（交互层 → Runtime → Engine → 渲染投影） |
| **引擎独立性** | ❌ **无独立引擎**。图逻辑在 Zustand slice 中，`graph-editing.ts` 导入 `@xyflow/react` 类型 | ✅ **完全独立**。`@my-project/graph-engine` 零框架依赖，纯函数 |
| **渲染分离** | ⚠️ 部分。React Flow 节点位置就是真实位置。`@nesso-how/graph` 组件默认只读 | ✅ **严格只读投影**。Cytoscape 禁止持有/修改 GraphData |
| **工具模型** | ❌ **无工具系统**。直接交互 + 菜单按钮 | ✅ **mediator 模式**。互斥、注册、事件路由 |
| **撤销** | 线性快照栈，50 步上限，推入完整 nodes/edges | 线性快照栈（引擎可计算逆操作） |
| **可扩展性** | 5 个已发布 npm 包（schema/vocab-learning/theme/graph/mcp） | 1 个内部引擎包 + 工具注册 |
| **可测试性** | 图逻辑与 React Flow 耦合 → 测试需要 React 环境 | 纯函数引擎 → 无需 DOM/框架 |

### 关键架构差异

**1. Nesso 没有独立的引擎层。** 这是两者最显著的区别。Nesso 的所有图操作（addNode、addEdge、deleteNode 等）直接写在 Zustand store slice 中，使用 React Flow 的 `applyNodeChanges`/`applyEdgeChanges`。没有 `validate()`、`execute()`、`reversal()` 的分层。没有 `applyBatch` 事务抽象。

**2. Nesso 的包发布策略更成熟。** `@nesso-how/schema`（纯序列化）、`@nesso-how/vocab-learning`（词汇定义）、`@nesso-how/graph`（可嵌入组件）、`@nesso-how/mcp`（MCP 服务器）——5 个已发布 npm 包。Asterism 目前只有 1 个内部引擎包。

**3. @nesso-how/schema 是纯 TypeScript 的（类 Asterism 的 engine/types）**，但它只处理 JSON 序列化/反序列化，不处理操作执行或验证。这是 Nesso 架构中和 Asterism 最相似的部分——一个框架无关的数据类型层。

**4. Nesso 的状态管理更集中。** 单 Zustand store（5 个 slice）+ persist 中间件 + IndexedDB。Asterism 分散在 Pinia stores + Engine 包中。

---

## 四、原创性验证

### 认知操作

| 操作 | Nesso 有？ | 说明 |
|------|-----------|------|
| **deconstruct**（解构为子概念） | ❌ | 无。用户只能手动创建新节点并画边 |
| **induce**（归纳为抽象） | ❌ | 无。无抽象节点概念，无归纳操作 |
| **internalize**（内化到常识层） | ❌ | 无。无数层结构（工作区 vs 常识层） |
| **diverge**（发散到另一张图） | ❌ | 无。多图谱间无类型化虚边/镜像机制 |

**结论**：即使和定位最接近的 Nesso 比，Asterism 的四种认知操作仍然是独特的。

### 布局操作

| 操作 | Nesso 有？ | 说明 |
|------|-----------|------|
| **orbit**（环绕布局） | ❌ | 无。仅有 React Flow 力导向拖拽 |
| **pathLayout**（路径布局） | ❌ | 无。无结构化路径排列 |
| **moveNode with collision** | ❌ | 无碰撞检测 |
| **findNewConceptPosition** | ⚠️ 有 | Nesso 有 `findNewConceptPosition` 辅助函数，用于新增节点的初始放置。但这是单点辅助，非引擎级编排操作 |

### 引擎独立性

| 维度 | Nesso | Asterism | 差距 |
|------|-------|----------|------|
| **引擎与 UI 分离** | ❌ 未分离 | ✅ 完全分离 | **Asterism 领先** |
| **操作验证** | ❌ 内联在 store | ✅ 独立的 `validate()` | **Asterism 领先** |
| **撤销为逆操作** | ❌ 完整快照 | ✅ 引擎可计算 reversal | **Asterism 领先** |
| **批量事务** | ❌ 无 | ✅ `applyBatch` | **Asterism 领先** |

---

## 五、总结：Nesso 对 Asterism 的启示

### Nesso 做得好的

1. **边类型系统的语义丰富度**：52 种命名类型带逆/传递/强度/极性/基数属性，配套视觉编码（SVG 字形 + 分类调色板 + 线型）。Asterism 的组合式 EdgeKind × Direction 更简洁，但缺少这种"每条边都有明确语义"的体验

2. **间隔重复集成深度**：FSRS 参数是节点数据的一部分，有完整的复习 UI（Again/Hard/Good/Easy）。这是 Asterism 完全没有的功能，但对"学习"场景至关重要

3. **产品完成度**：多图谱、桌面端（Tauri）、导入/导出、国际化（en/it）、遥测、自动更新、新手引导——Phase 2b MVP 尚未覆盖这些

4. **MCP 服务器已发布**：`@nesso-how/mcp` 让 LLM 可直接构建有效图谱 JSON

5. **可嵌入图谱组件**：`@nesso-how/graph` 是只读 React 组件，可供外部应用使用

### Nesso 做得不如 Asterism 的

1. **无引擎层**：图逻辑与 React Flow 耦合。没有独立的函数式引擎，操作不可独立测试。这是最显著的架构差距

2. **无认知操作**：只有 CRUD，没有 deconstruct/induce/internalize/diverge。用户手动管理一切

3. **无结构化布局**：只有 React Flow 的原生拖拽和 `findNewConceptPosition` 辅助函数。无 orbit/pathLayout/collision detection

4. **无类型化节点**：单节点类型（`ConceptNodeData`），无 NodeRole 判别。所有节点都是"概念"，无法区分原子 vs 抽象、知识 vs 引用

### 总体判断

Nesso 是 Asterism 目前遇到的最直接竞品——两项目明确说"不是笔记应用"，都用图结构表示理解状态。但走的是**不同产品路径**：

| | Nesso 路径 | Asterism 路径 |
|--|-----------|-------------|
| **核心** | 语义丰富的边 + 间隔重复记忆 | 形式化的图转换 + 认知操作 |
| **用户操作** | 选择关系类型，复习卡片 | 执行解构/归纳/内化/发散 |
| **架构** | Flux store（实用优先） | 独立引擎（形式化优先） |
| **AI** | 已落地苏格拉底导师 | 规划中 |

两者并非直接竞争——Nesso 强在**记忆保持和语义精准**，Asterism 强在**认知结构变换和架构纯度**。如果未来 Asterism 想要间隔重复，可以参考 Nesso 的 FSRS 集成模式和"FSRS 数据与图谱分离"的设计决策。
