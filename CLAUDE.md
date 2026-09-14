# Asterism

## 核心定义

- **狭义 GraphData**：`packages/graph-engine/src/types/graph_data.ts` 中需要持久化存储的图结构类型。
- **广义 GraphData**：需要持久化存储的图数据 + 由持久化存储图数据在运行时派生出来的数据。
- **GraphEngine**：框架无关、本项目特定义下无副作用（不通过引用修改外部数据）的广义 GraphData 状态迁移引擎，是系统中所有 GraphData 转换操作的唯一入口。
- **Runtime 状态与图业务层**：位于前端的 GraphData 状态所有者，负责持有运行时状态、编排引擎操作（调 Engine → 后处理）、实现持久化 I/O；框架绑定（当前为模块级单例 + Vue）。内部再分两层：
  - **graph_store.ts（数据核心）**：公开能力为四入口。
  - **use-case/（业务用例层）**：图数据业务逻辑的封装，经 store 公开状态访问共享运行时数据。
- **Cytoscape 渲染与交互层**：GraphData 的只读映射/拷贝。接收 GraphData 渲染到画布，捕获交互事件后经工具交互逻辑层（feature-tools/）回流至 Runtime。
- **工具**：前端页面中用户主动激活的状态。在此状态下，用户的画布交互（点击、拖拽）被解释为该工具特有的语义，并最终转化为对 GraphData 的修改。按交互入口分为两类：
  - 常驻操作栏工具：通过工具栏按钮激活
  - 模式工具：先进入 Cognition 或 Arrangement 模式，再选择具体操作
- **工具交互逻辑层**：用户与工具的交互通道，采用"水平分层 + 垂直自包含"混合架构——水平分层提供所有工具共享的按钮定义、生命周期管理与事件转发；垂直自包含使每个工具独立持有自己的激活状态、光标样式与画布交互处理。

## 命令

```bash
# 启动前端开发服务器
pnpm dev
# 跑所有前端测试
pnpm --filter frontend test
# 跑所有 GE 测试
pnpm --filter @my-project/graph-engine test
# 前端类型校验
pnpm --filter frontend type-check
# GE 类型校验
pnpm --filter @my-project/graph-engine type-check
# 格式化全项目代码（frontend + graph-engine + docs + md）
pnpm format
# 格式化单个文件（自动读取根 .prettierrc.json 配置）
npx prettier --write <文件路径>
```

### 测试文件约定

- vitest `globals: true` 已启用。`test` / `describe` / `expect` / `beforeEach` / `afterAll` / `vi` 均为全局函数，`.test.ts` 文件中**禁止** `import { ... } from 'vitest'`。
- 使用 `test()`，禁止 `it()`。
- 测试物理位置：前端 `frontend/src/**/*.test.ts`（单元 / 组件）+ `frontend/tests/**`（Runtime 集成）；引擎仅 `packages/graph-engine/tests/**`。

## 项目定位

- **Graph Engine 开发目标**：让用户当前的学习 / 认知 / 研究状态可视化、可形式化表达。
- **Asterism** 在管理学习者与知识之间的**学习状态**，而不是认知/知识本身。

## 技术栈

### 前端

- Vue 3 (Composition API + `<script setup>`)
- TypeScript 6.0
- 模块级单例 store（`useGraphStore`，非 Pinia）
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

### MVP 阶段暂不启动

- FastAPI 后端
- Supabase 集成

## 文档地图与任务落点

先按「我要做的事」定方向，再读「先读」。

| 我要做的事 | 先读 |
| --- | --- |
| 查设计概念 / 设计名词 | [设计术语表](docs/设计/设计术语表.md) |
| 查代码标识符 | [开发术语表](docs/开发文档/开发术语表.md)（只做检索索引，**不定义文件 / 目录 / 层**） |
| 查文件 / 文件夹 / 分层的定义 | [架构图](FOR-AGENTS/架构/README.md)（即本文件 §项目架构） |
| 查交流口径 / 项目术语 | [项目术语表](项目术语表.md) |
| 写 / 改代码注释 | [注释资料](FOR-AGENTS/注释资料.md) |
| 了解设计意图 / 交互规则 | [docs/设计/](docs/设计/)（L1，最高权威，只读） |
| 查开发历史 / 过程文档 | [docs/开发文档/](docs/开发文档/)（历史快照，不代表当前 API） |
| 了解目录局部规则 | 该目录及祖先目录的 `AGENTS.md`（见下） |
| 理解架构 / 依赖方向 | 本文件 §项目架构 |
| 查阅外部技术文档 | [Vue 3](https://cn.vuejs.org/guide/introduction.html)、[HTML](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Structuring_content)、[CSS](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Core/Styling_basics)、[Tailwind CSS](https://tailwindcss.zhcndoc.com/docs/styling-with-utility-classes)、[Cytoscape](https://js.cytoscape.org/) |

> 分工：**文件 / 文件夹 / 分层的定义看架构图；代码标识符的检索看开发术语表。**

当前版本 tag：`v0.2.0`。

### 目录就地规则（AGENTS.md）

各目录的就地约定写在该目录的 `AGENTS.md`：

- 引擎：[packages/graph-engine/AGENTS.md](packages/graph-engine/AGENTS.md)
- 渲染：[frontend/src/cytoscape/AGENTS.md](frontend/src/cytoscape/AGENTS.md)
- 组件：[frontend/src/components/AGENTS.md](frontend/src/components/AGENTS.md)
- 组合式函数：[frontend/src/composables/AGENTS.md](frontend/src/composables/AGENTS.md)
- 开发工具：[frontend/src/dev/AGENTS.md](frontend/src/dev/AGENTS.md)

**发现机制**：改动任何目录前，先查该目录及其**祖先目录**的 `AGENTS.md`。
**优先级**：`AGENTS.md` 可覆盖 CLAUDE.md 的**默认习惯约定**（且必须在该文件内显式声明这是覆盖），但**不得覆盖 §项目架构 的契约与架构边界**。

### 术语表时效

#### 时间戳

**设计术语表**：`Last updated: 2026-09-07`
**开发术语表**：`Last updated: 2026-09-12`
**项目术语表**：`Last updated: 2026-09-12`

## 项目架构（分层森林图 · 顶层视图）

模型：节点按 **充要定义一行 / 精确实现一行 / 契约一行或多行** 书写
* 充要定义用符号 `≝` 表达，用自然语言书写
* 精确化实现用集合语言并以集合关系符 `= ⊂ ⊃` 连接充要定义集
  * `=`：定义和实现一致
  * `⊂`： 定义不包含实现
  * `⊃`： 实现落后于定义
* 契约用 `s.t.` 引出**命题逻辑**，并用逻辑联结词（`∨ ∧ ¬ ⇒ ⟺`）构造由自然语言表达的各个简单命题，履行契约对应命题为真，违反契约对应命题为假
  * `∨` 理解为：只要不是“两侧都假”就为真。
  * `∧` 理解为：只要不是“任一侧假”就为真。
  * `¬` 理解为：真值取反。
  * `⇒` 理解为：只要不是“前件真，后件假”就为真。
  * `⟺` 理解为：只要不是“两侧真值不同”就为真（即 `A ⇒ B ∧ B ⇒ A`）。
* **顶层各个架构层**默认**代码文件目录即精确实现的集合，故顶层不写**，但写定义行和契约行
* 缩进 = 层级，每级 4 空格：根 `0` / 层与流 `4` / 层属性 `8` / 目录项 `12`
  * 层间流（`↓` / 值 / `§` 引用）与层名同级，不缩进进层内
  * 目录项续行对齐到该文件的 `≝`；语义续行以 `│` 引导，纯对齐可省 `│`
* 数据流由**层**（黑盒行）与**值**（数据行）交替构成，行间以 `↓` 连接
  * `↓` 独占一行，写 `↓ [函数]`：上面是输入或层，下面是输出或层，右边是转换动作，可留空
  * 层为黑盒：`≝` / `=` / `s.t.` 只声明接口；层上方的 `↓` 是其入口，下方的 `↓` 是其出口
  * 多条 `↓` 按行、列排布：列 = 一条管道，同行并列 = 并行管道；读序行自上而下、行内自左而右
* 行末右侧 `←` 表注解
* `§` 引用已定义的章节或层，写 `§<名>`
  * 架构图中同一层重复出现（数据流回经该层）时写 `§<层名>`，不再重复 `≝` / `=` / 注解
  * 反馈（逆层序）把目标层重锚到下方，保持输入在上、输出在下

```text
Asterism
    ≝ 以"当前学习状态"为核心对象，以图论图为载体的可视化系统
    s.t. GraphData 唯一事实源 ∧ Cytoscape 仅 Renderer ∧ Local First ∧ ¬内部代码标识符别名的使用
    s.t. ¬watch(deep:true)  ← GraphData 变更走引用替换，浅层 watch 足够；deep 有未知非预期行为；替代：去掉 deep 或窄化到叶子属性

    共享组合式函数
        ≝  跨模块复用的 Vue 组合式函数
        =   frontend/src/composables/
            ├── useFloatingWindow.ts     ≝ 浮空窗单例
            ├── useCanvasFocus.ts        ≝ 画布视口定位请求单例
            ├── useDragPosition.ts       ≝ 通用窗口拖拽工厂
            ├── useOverflowDetection.ts  ≝ DOM 水平溢出检测工厂
            └── useAutoFade.ts           ≝ 依指针位置的通用自动淡化工厂
        s.t. 组合式函数在横切方向上共享 ∧ ¬参与单向数据流

    用户交互【外部事件源】  ← 非目录层
        ≝ 用户经过浏览器 DOM 产生的原生输入事件源
    
    ↓
    原生 DOM 事件：用户的点击 / 双击 / 悬停 / 右键
    ↓ Cytoscape 捕获 DOM 事件
    合成的 Cy 原始事件
    ↓

    Cytoscape 渲染与交互层
        ≝  持有 Cytoscape 实例；渲染到画布并把 Cy 原始事件翻译为语义事件；对外暴露光标追踪/高亮/预览渲染 API
        =   frontend/src/cytoscape/
            ├── useRenderer.ts        ≝ 渲染运行时 Cy 单例唯一持有者
            │                         s.t. 渲染 GraphData ⇒ 经 syncFromGraphData 唯一入口
            ├── cy_element_mapper.ts  ≝ GraphData → CyElements 的映射
            ├── mapper-utils/         ≝ 私有 Cy 样式转换器：折叠过滤、视觉样式映射、高亮
            ├── cy_style.ts           ≝ Cy 视觉样式配置
            ├── cy_interaction.ts     ≝ Cy 原始事件 → 语义事件
            │                         s.t. 翻译 ∧ ¬转发 ∧ ¬直接写图
            ├── cy_popper.ts          ≝ 浮空窗元素的锚定
            └── cy_canvas.d.ts        ≝ Cy 扩展类型声明
        s.t. ¬持有 GraphData 引用 ∧ ¬保存业务状态 ∧ ¬修改 GraphData ∧ ¬作为事实源

    ↓
    语义事件：onNodeClicked / onEdgeClicked / onRightClick / onNodeDoubleClicked / onNodeHovered          组件语义事件
    ↓ mediator 转发到活跃工具

    工具交互逻辑层
        ≝  负责操作、认知、 布局与默认工具的管理与定义；把语义事件路由到活跃工具；工具自包含地完成选择/预览/确认
        ⊃  frontend/src/feature-tools/
            ├── types.ts         ≝ 工具系统类型契约接口
            ├── mediator.ts      ≝ 工具生命周期管理的唯一入口，采用中介者模式
            │                    = { register, activate, deactivate, onCanvasClick, onNodeClick, onEdgeClick, onRightClick }
            │                    s.t. 同一时刻一个活跃工具 ∧ (deactivate ⇒ 恢复 default 工具) ∧ ¬存在"无工具"状态
            ├── default_tool.ts  ≝ 默认工具：点节点/边 → 浮空窗 → 确认后写入
            ├── toolbar/         ≝ 常驻（操作）工具栏的按钮配置与各工具处理器
            ├── cognition/       ≝ 认知工具 handler
            │                    ⊃ {deconstruct}
            │                    s.t. induce / internalize / diverge 待从 operation_controller 迁入
            └── preview/         ≝ 预览模拟管道
                                 s.t. 只计算不渲染 ∧ ¬写持久化 GraphData
        s.t. ¬直接写 GraphData ∧ (写 GraphData ⇒ 经 commitToCurrentGraph ∨ commitBatches) ∧ ¬(存储 GraphData ∨ UI 模式切换)

    ↓                                                 ↓                                                     ↓
    操作 / 批次                                        图谱 ID                                               Graph.vue 快捷键事件
    ↓ 单图 commitToCurrentGraph / 跨图 commitBatches   ↓ goToGraph / default_tool 双击                       ↓ useGraphOperation.undo / redo
    ↓ useGraphStore().commitBatchToGraphs             ↓ useGraphStore().loadGraphToView                     ↓ 

    Runtime 状态与图业务层
        ≝  持有 GraphData 状态，是其唯一事实源与唯一写入口；编排引擎操作、封装业务用例、并实现持久化
        ⊂  frontend/src/graph/ + frontend/src/ui/
            ├── graph_store.ts              ≝ GraphData 唯一事实源 + 所有修改的唯一合法入口
            │                               = { loadGraphToView, commitBatchToGraphs, undo, redo }
            │                               s.t. (store 公开合法入口 ⟺ loadGraphToView ∨ commitBatchToGraphs ∨ undo ∨ redo) 
            │                               s.t. ¬(Draft ∈ store) ∧ ¬(Cytoscape ∈ store)
            ├── use-case/                   ≝ 图数据业务用例
            │                               s.t. ¬持有状态本身
            ├── utils/                      ≝ graph/ 域下无状态私有纯函数
            ├── graph_registry.ts           ≝ 多图注册表
            ├── graph_persistence.ts        ≝ localStorage 持久化实现
            │                               s.t. Local First  ← 切图时 loadGraph 读入；提交时 saveGraph / deleteGraph 写出
            └── ui/operation_controller.ts  ≝ 认知与布局操作编排  ← 历史遗留，待迁 feature-tools/
        s.t. (图数据业务逻辑 ∈ use-case ∧ ∉ store) ∧ (内部单向依赖：业务 → 用例 → store)
        
    ↓                                                                       ↓
    注册表 + 批                                                              操作参数
    ↓ apply_batches                                                         ↓ compose（§工具交互逻辑层 / ui 编排层 调用）
    
    GraphEngine
        ≝  纯函数式编写的唯一图数据定义与转换入口
        =   packages/graph-engine/src/
            ├── types/           ≝ 类型定义
            ├── compose/         ≝ 有实际语义与用户价值的一次编排操作
            │                    s.t. 只产出 operations / batches ∧ ¬执行 ∧ 返回值由原子操作构成
            ├── core/            ≝ 执行与事务
            │                    = {apply_batch、apply_batches、reversal、replay、derive、rules/、utils/}
            │                    s.t. 时间戳 = 调用方经 executedAt 传入 ∧ (replay 外 ¬new Date()) ∧ 对象级 createdAt/updatedAt = 操作携带值 ?? executedAt  ← new Date() 兜底仅存于 core/replay.ts 与前端 commitBatchToGraphs
            ├── infrastructure/  ≝ 纯查询与计算几何
            ├── spi/             ≝ 持久化适配器接口
            └── index.ts         ≝ 包的公开入口
        s.t. ¬副作用 ∧ ¬I/O ∧ ¬框架依赖 ∧ ¬持久化 ∧ ¬持有状态
        
    ↓                                                                      ↓
    新注册表（含新图数据）                                                   图规则校验结果
    ↓ store.graphRegistry 引用替换                                          ↓ 写入 lastValidationResult

    §Runtime 状态与图业务层

    ↓                                           ↓
    新 graphView                                lastValidationResult
    ↓ watch(GraphView)                          ↓

    组件与装配层
        ≝  承载视图单元与页面装配
        =   frontend/src/components/ + frontend/src/views/
            ├── components/      ≝ 视觉单元
            └── views/Graph.vue  ≝ 装配层
        s.t. 装配层渲染 GraphView ⇒ 经 renderer.syncFromGraphData
    
    ↓                                                                        ↓
    GraphView（引用替换后）                                                   预览图
    ↓ renderer.syncFromGraphData                                             ↓ renderer.syncFromGraphData  ← 此时不写持久化 GraphData
    
    §Cytoscape 渲染与交互层

    ↓
    CyElements
    ↓

    Cytoscape Renderer【外部渲染器】  ← 外部库，非目录层
```

> 契约：本文件各层 `s.t.` 行与代码头「调用契约」　·　依赖与禁止边：见 [FOR-AGENTS/架构/依赖图.md](FOR-AGENTS/架构/依赖图.md)　·　模型与图例：见 [FOR-AGENTS/架构/README.md](FOR-AGENTS/架构/README.md)

## 前端架构设计

### UI/UX设计指导

- 对于 UX，代码中的状态设计应当遵循用户在交互时可感知的最小**交互单元**
- 对于 UI 的架构设计，应当满足用户在页面上可见的最小可分类的**视觉单元**

---

## 代码规范

### 变量命名规则

- 长度随作用域变化（即：局部变量短小即可）
- 模块级作用域或对象内部跨多个函数体的共享变量命名必须明确，可以被检索

### 标识符别名（禁止）

禁止为项目**内部标识符**创建别名（第二个名字）。包括：

- 导出别名：`export { InternalName as PublicName }`
- 导入改名：`import { InternalName as LocalName }`
- 用 `type B = A` 为已有类型起等价别名；或为同一概念维护两个类型 / 函数 / 常量名（含标注"向后兼容别名"者）

一个概念只对应一个标识符。需要更名时，直接改定义处并同步全部引用，不保留别名。
理由：别名使同一概念出现两个可检索名，破坏 grep 定位与一致性（同义两名）。本项目唯一用户是开发者本人，旧名无外部兼容负担——这是 §早期开发策略 中"不写兼容代码"在标识符层的落地。

> 注：`type NodeData = KnowledgeNodeData | ReferenceNodeData` 这类**并集/派生定义**是定义新概念，不属别名，允许。

### 文件命名（snake_case）

所有 `.ts` 文件统一 `snake_case`：

- ✅ `graph_store.ts`, `graph_registry.ts`, `graph_persistence.ts`
- ❌ `GraphStore.ts`, `graphStore.ts`, `Graph_Store.ts`

其他两类：

1. **Vue 组件文件**（`.vue`）：统一 **PascalCase**（Vue 生态约定）
   - ✅ `GraphFloatingWindow.vue`, `GraphPermanentToolbar.vue`, `NotificationPanel.vue`

2. **Vue 组合式函数**（以 `use` 开头的 `.ts` 文件）：统一 **camelCase**（Vue 生态约定 + 区分于普通工具函数）
   - ✅ `useRenderer.ts`, `useDragPosition.ts`, `useOverflowDetection.ts`
   - ❌ `use_renderer.ts`, `useDrag_Position.ts`

### 缩进规范

**4 空格**。禁止 Tab，禁止 2 空格。

### 注释参考资料

任何要编写或修改代码注释（含单行注释与 TSDoc）的任务，动手前必须先阅读：[注释资料](FOR-AGENTS/注释资料.md)

委派编码子代理（fixer / designer 等）时，若其任务会编写或改动代码注释，须在委托指令中要求该子代理先阅读上述注释资料。

### Import 组织规范

强制分组 + 空行分隔
规则：

- 每组之间空一行
- `type` import 和普通 import 不要混在同一组

### 单次调用函数是否内联

内联的价值是防止阅读时跳来跳去，但前提是和提取成工具函数后一样"职责清晰、分块明显、注意力引导明确"。判断依据是**参数数量**——参数数量约等于提取的理解成本与耦合度：

| 场景 | 拆不拆 |
| --- | --- |
| 无参 / 单参，只调 1 次 | ✅ 允许提取（提取成本低、函数名即注意力引导），不强制内联 |
| 多参，只调 1 次 | ❌ 倾向内联（多参提取会把与主流程的耦合摊到函数签名上，读者仍需停下来想） |
| 被 ≥2 个函数调用 | ✅ 拆为辅助函数 |
| export 为公开 API | ✅ 独立函数及文档注释 |

### 私有函数放在文件末尾

模块内部辅助函数（不 export）按调用链从公开到私有的顺序排列，即私有函数放在文件末尾。阅读者自上而下先看到公开 API，按需跳转到末尾的私有实现。

```ts
// 推荐的顺序
export function publicApi() { ... }          // 公开函数在前

function helperA() { ... }                   // 私有辅助在末尾
function helperB() { ... }
```

### Vue 模板语法规范

**禁止缩写**。Vue 模板中所有指令必须使用完整形式，不准使用@或者:缩写：

### Markdown 文档格式

- 根 `.prettierignore` 已排除 `*.md`：Markdown **不参与 Prettier 格式化**，由手工维护。
- 表格统一**紧凑式**：单元格两侧各一个空格（`| 中文 | 英文 | 含义 |`），分隔行统一 `| --- | --- | --- |`，**不补空格对齐列宽**。

## 早期开发策略

- 在目前这个早期开发阶段，不准任何形式的静默退出。具体做法可参考`graph_store.ts`，思想是报错代码不要打扰核心逻辑代码的阅读
  - 冗长错误消息的构造，提取为私有辅助函数进行调用
  - 校验结果统一模式：GE 产出 `ValidationResult`，前端用例层统一写入 `graphStore.lastValidationResult`，UI 按 `issue.code` 区分提示；业务规则校验（如 title 非空、根图谱间唯一）下沉 GE 图级校验（注册表全量可查），前端不散落
- 本项目当前唯一用户是**开发者本人**（无外部 / 第三方用户）：不写面向外部用户的**数据兼容与版本迁移代码**，以保持代码简洁、核心逻辑突出。破坏性变更（含持久化字段 / 结构）由开发者自行承担——变更前按需备份本地数据（localStorage）
- 写完代码后自查代码本身是否利于未来变更（ETC：Easier To Change，易于变更），否则向上报告

## 设计决策权限

| 行为 | 允许 | 禁止 |
| --- | --- | --- |
| 在对话中提供设计建议、架构方案 | ✅ |  |
| 将自发的设计决策写入文档文件（`docs/` 下的任何 `.md`） |  | ❌ |
| 经用户明确许可后修改文档 | ✅ |  |
| 修改代码（`.ts` / `.vue` 等源文件） | ✅ 按现有规范执行 |  |

规则：

1. **文档修改必须由用户明确许可后执行。** 文档 = `docs/` 目录下所有 `.md` 文件 + `CLAUDE.md` + 项目根目录 `.md`。
2. **不允许主动提出"要不要我把这个写进文档"。** 只在用户问到时回答"需要的话可以"。
3. **代码按现有规范自由修改**，无需额外确认。
4. 此规则旨在确保用户（而非 AI）是设计文档的唯一作者——AI 的产出进入对话和代码，不进设计文档。

## 文档层级与冲突处理

`docs/` 下三个子目录存在严格的权威层级：

| 层级 | 目录 | 角色 | 生命周期 | 内容 |
| --- | --- | --- | --- | --- |
| L1 | `docs/设计/` | 产品 spec | 持久 | 用户亲手书写的设计定义、交互规则、视觉规范。描述产品意图与用户体验目标。 |
| L2 | `步骤/` | 过程文档 | 临时（完成后归档） | 步骤文档（步骤划分、进度跟踪、难度评估、产出 commit 的引用）和发现文档（BUG / 改进 / 不确定项）。服务于实现过程，不可违背 L1。 |
| L3 | `提示词/` | 施工手册 | 一次性 | Agent 执行时的工程契约。包含功能需求、验收标准、scope guard、交互规则。溯源引用 L1 |

**冲突处理规则**：

1. 出现设计冲突时，**优先参考上级文档**。L1 > L2 > L3。
2. 当施工 spec（L3）与设计文档（L1）的意图矛盾时，以设计文档为准。
3. 若施工 spec 未覆盖某话题，开发文档的结论为有效默认值。否则就根据 L1 设计自行推导，最后作为不确定项向上报告

## 该项目 Debug 的特效药

**注意**：修 BUG 时，不要一直推测，如果发现一个 BUG 有多个不确定的修改方向，应主动和用户协商尝试使用以下 Debug 的方法

- 个人推荐首先尝试 log 大法：在项目的流单向数据流下，专治**某一层数据修改异常**、**设计与执行不一致**、**没有 Debug 线索**
- 其次是针对 GE 的单元测试：GE 纯函数式编程，输出可复现。
