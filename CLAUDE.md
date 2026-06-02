# my-first-project — Knowledge Graph Runtime

## 项目定位

构建一个长期演化的知识图谱运行时（Knowledge Graph Runtime），而不是 Cytoscape Demo。

## 技术栈

### 前端
- Vue 3 (Composition API + `<script setup>`)
- TypeScript 6.0
- Pinia (3 个 Store)
- Tailwind CSS v4
- Cytoscape.js 3.33
- pnpm（禁止 npm / yarn）

### 后端（规划中）
- FastAPI (Python)

### 数据库（规划中）
- Supabase

### AI（规划中）
- LangChain
- LangGraph

### 开发环境
- WSL Ubuntu + VSCode

## 核心原则（必须遵守）

1. **GraphData 是唯一事实源（Single Source of Truth）**
2. **Cytoscape 只是 Renderer**，永远不是事实源
3. **Runtime 优先于 UI**
4. **所有 GraphData 修改必须经过 `graph_store.applyOperation()`**
5. **Local First** — 当前用 localStorage 持久化
6. **Position 持久化** — GraphData.position 是唯一位置事实源
7. **Cognitive State 持久化** — 折叠/展开状态随 GraphData 一起持久化

## 架构分层（严格单向数据流）

```
用户交互 (DOM)
    ↓
Cytoscape 交互适配层 (use_graph_interaction.ts)
    ↓ 语义事件 (CanvasClicked, NodeClicked, EdgeClicked, NodeDragEnded)
    ↓
UI Runtime 编排层 (operation_controller.ts)
    ↓ GraphOperation
Graph Runtime (graph_store.ts) ← 唯一事实源
    ↓ watch(currentGraph)
渲染投影层 (graph_element_mapper.ts)
    ↓ CyElements
Cytoscape Renderer (use_cytoscape_renderer.ts)
```

## 三个 Pinia Store

| Store | 职责 | 禁止 |
|-------|------|------|
| graph_store | GraphData 唯一事实源，applyOperation() 唯一写入点 | Draft/Cytoscape 禁止进入 |
| ui_store | 用户 UI 意图（交互模式、选中工具、浮空窗） | 不保存 GraphData |
| draft_store | 临时草稿（DraftNode/DraftEdge），互斥 | 不直接进入 GraphData |

## Cytoscape 边界（最重要）

- 禁止 cy 修改 GraphData
- 禁止 cy 持有 GraphData 引用
- 禁止 cy 保存业务状态
- 数据流只能是 GraphData → Cytoscape，不允许反向
- 反向必须经过：Interaction → Controller → GraphStore

## 目录结构

```
src/
├── components/
│   ├── KnowledgeGraph.vue          # 组合层（挂载渲染器+交互+子组件）
│   └── graph/
│       ├── NodeWindow.vue          # 节点浮空窗
│       └── OperationToolbar.vue    # 操作工具栏
├── definitions/
│   ├── rules/graph_rules.ts
│   ├── types/                      # graph_types, ui_types, draft_types, ai_types 等
│   └── validators/                 # operation_validator, graph_validator, rule_checkers
├── graph/
│   ├── graph_store.ts              # Pinia Store：GraphData 唯一事实源
│   ├── graph_persistence.ts        # localStorage 持久化
│   └── cytoscape/
│       ├── graph_element_mapper.ts # GraphData → CyElements 投影
│       ├── cytoscape_style.ts      # Cytoscape 样式
│       ├── use_cytoscape_renderer.ts # Cytoscape 生命周期 (mount/sync/destroy)
│       └── use_graph_interaction.ts  # 交互事件 → 语义事件
├── ui/
│   ├── ui_store.ts                 # Pinia Store：UI 意图
│   ├── draft_store.ts              # Pinia Store：草稿
│   └── operation_controller.ts     # UI Runtime 编排器
├── router/index.ts                 # 路由（当前仅 / → KnowledgeGraphView）
├── views/KnowledgeGraphView.vue
├── mock/                           # Mock 数据
└── dev/test_runtime.ts             # 开发期测试工具
```

## 当前已支持的 Operation

- add_node / add_edge
- delete_node / delete_edge（支持 Ctrl+Z 撤销，undoStack 最多 20）
- update_node / update_edge
- move_node（拖动结束后写回位置）
- collapse_dependency / expand_dependency（认知状态，纯视觉折叠）

## 重要 Commit

- `3755f74` — refactor-graph-isolate-cytoscape-runtime（已完成 Cytoscape 隔离）
- `639358d` — refactor(graph): isolate cytoscape runtime layers

## 下一阶段任务（按优先级）

1. **NodeWindow Runtime** — 统一 DraftNode 与 ExistingNode 编辑
2. **OperationToolbar Runtime** — 完善 Add Edge / Delete / Fold / Move
3. **OperationController 收口** — 彻底封死 ui_store/draft_store 对外暴露

## 当前 MVP 阶段暂不启动

以下属于后续阶段规划，MVP 阶段先聚焦前端 Runtime 本身：

- AI Runtime (LangChain / LangGraph)
- FastAPI 后端
- Supabase 集成
- Auto Save / IndexedDB
- Add Edge / Delete / Fold MVP 交互层
  （等 NodeWindow / OperationToolbar / OperationController 完成后再说）

## 设计文档

- 完整设计文档：`E:\code\MyProject\MVP\设计文档\知识图谱设计.md`

---

# 代码规范

## 一、总体原则

代码服务于 **Runtime 规则表达**，而不是实现细节表达。优先描述"这个对象是什么 / 承担什么职责 / 遵守什么规则"，而不是"这行代码在干什么"。

核心：**注释解释规则，代码表达实现。**

## 二、文件命名（snake_case）

所有 `.ts` 文件统一 `snake_case`：
- ✅ `graph_store.ts`, `ui_store.ts`, `graph_operation_types.ts`, `graph_persistence.ts`
- ❌ `GraphStore.ts`, `graphStore.ts`, `Graph_Store.ts`

Vue 组件文件例外：统一 **PascalCase**（Vue 生态约定）：
- ✅ `KnowledgeGraph.vue`, `NodeWindow.vue`, `OperationToolbar.vue`

## 三、缩进规范

**4 空格**。禁止 Tab，禁止 2 空格。`.editorconfig`、ESLint、Prettier 已统一配置。

## 四、文件头注释

每个 Runtime 文件必须有文件头说明：
```ts
/**
 * 功能：
 *     ...
 *
 * 总体结构：
 *     ...
 *
 * 外部如何使用：
 *     ...
 */
```

## 五、接口注释（interface / type / class / enum）

所有类型定义必须有：
```ts
/**
 * 功能：
 *     ...
 *
 * 规则：
 *     ...
 */
export interface XXX { }
```

## 六、函数注释

所有公开函数必须有：
```ts
/**
 * 功能：
 *     ...
 *
 * 规则：
 *     ...
 *
 * 使用：
 *     ...
 */
```

## 七、禁止内部注释

允许：文件头 / 接口 / 函数注释。
禁止：变量注释、逐行注释、解释代码行为的废话注释。

## 八、状态定义规范

状态字段名表达规则，禁用 `a: any` 式定义。

## 九、Store 设计规范

Store = 状态 + 动作。不负责 UI 渲染 / DOM 操作 / Cytoscape 操作。

## 十、注释层级

文件 → 接口 → 函数，三层封顶。禁止更深层注释。

## 十一、空行规范

逻辑块之间可空行分隔（如 actions 之间），禁止连续大量空行。

## 十二、命令行规范

命令前写说明注释。

## 十三、Git 提交格式

**动词 + 模块 + 目的**（空格分隔）：
```
add graph persistence runtime
refactor ui runtime state machine
fix validator smoke test type guards
```

## 十四、回答/协作规范

说明为什么做 → 说明设计规则 → 给出代码 → 给出命令。保留原精神，适配 Claude Code 的直接文件操作模式。

## 十五、GraphData 唯一事实源（项目基石）

所有 GraphData 修改必须经过 `graph_store.applyOperation()`。

## 十六、Import 组织规范

强制分组 + 空行分隔，顺序如下：
```ts
// [1] 第三方库
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// [2] 项目 definitions（类型 & 校验）
import type { GraphData } from '@/definitions/types/graph_types'
import { OperationValidator } from '@/definitions/validators/operation_validator'

// [3] 项目 graph / ui runtime
import { useGraphStore } from '@/graph/graph_store'
import { useUIStore } from '@/ui/ui_store'

// [4] 相对路径导入（组件等）
import NodeWindow from './graph/NodeWindow.vue'
```

规则：
- 每组之间空一行
- `type` import 和普通 import 可以混在同一组
- 组内按路径字母序

## 十七、Vue 组件命名

`.vue` 文件统一 **PascalCase**（与 Vue 生态一致），`.ts` 业务文件保持 **snake_case**。

## 十八、前端特有机制注释规范

**原则**：对于依赖 Vue / TypeScript / 前端框架特有行为（非通用编程范式）的代码，必须在注释中说明机制，帮助熟悉 C++ 但不熟悉前端的开发者理解"魔法"。

**格式**：在现有注释结构中增加"前端机制"小节（放在"规则"之前或之后，视上下文而定）：

```
 * 前端机制（供熟悉 C++/通用编程但不熟悉前端框架的开发者参考）：
 *     - 模式名：机制说明。
 *       C++ 类比：对应的 C++ 概念。
```

**适用范围**（非完整列表，视需要添加）：

| 机制 | 触发条件 |
|------|---------|
| Vue 响应式 | `ref()`, `computed()`, `watch()` |
| Vue 生命周期 | `onMounted()`, `onBeforeUnmount()` |
| Pinia | `defineStore()` + `useXxxStore()` |
| 编译时语法糖 | `<script setup>`, `<style scoped>`, template `ref` |
| 模板绑定 | 复杂的 `v-if`/`v-for`/动态绑定链条 |

**规则**：
1. 只解释 **"为什么会这样"**，不解释"这行代码在干什么"（不违反第七条）
2. 优先用 **C++ 类比**降低认知负担
3. 只标记**非直觉的框架行为**，通用 TypeScript/JS 语法不解释
4. 简单模板语法（如单个 `@click`）不需要注释，复杂的响应式链条才需要

**评判标准**：

| 场景 | 加不加 |
|------|--------|
| `ref()` 模板引用自动绑定 DOM | ✅ 加 |
| `computed()` 缓存计算与自动失效 | ✅ 加 |
| `watch()` 深层监听与自动依赖追踪 | ✅ 加 |
| `defineStore` 的 `state` 是工厂函数 | ✅ 加 |
| `<script setup>` 编译期行为 | ✅ 加 |
| `<style scoped>` 自动作用域隔离 | ✅ 加 |
| `v-if="x"` 条件渲染 | ❌ 不加 |
| `@click="fn"` 事件绑定 | ❌ 不加 |
| `import { fn } from 'vue'` | ❌ 不加 |

### 示例：KnowledgeGraph.vue 文件头

```ts
/**
 * 功能：
 *     KnowledgeGraph 页面组合层。
 *
 * 总体结构：
 *     1. 挂载 Cytoscape 容器
 *     2. 初始化 Cytoscape Renderer
 *     3. 监听 GraphData 变化并同步渲染
 *     4. 绑定 Cytoscape 语义交互事件
 *     5. 挂载 NodeWindow 与 OperationToolbar
 *
 * 前端机制（Vue 3 框架行为）：
 *     - <script setup lang="ts">：
 *       Vue 3 编译期语法糖。顶层变量自动暴露给模板，import 的组件自动注册。
 *       C++ 类比：编译器自动生成声明，无需手动写 return / components。
 *
 *     - ref<HTMLDivElement | null>(null)：
 *       Vue 响应式引用。模板中的 ref="cyContainer" 自动将 DOM 元素赋值给 .value。
 *       C++ 类比：std::shared_ptr + Observer 通知，但框架自动管理注册/注销。
 *
 *     - onMounted / onBeforeUnmount：
 *       生命周期钩子。onMounted ≈ 构造函数（DOM 已挂载），
 *       onBeforeUnmount ≈ 析构函数（组件销毁前清理）。注意 onMounted 之前 ref 为空。
 *
 *     - watch(source, callback, { deep: true })：
 *       响应式观察者。source 中访问的响应式值变化时触发 callback。
 *       deep: true 递归监听嵌套属性。C++ 类比：Observer + 自动深比较 + 自动注册/注销。
 *
 * 外部如何使用：
 *     App.vue 直接挂载本组件。
 */
```
