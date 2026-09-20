> 上级入口：项目根目录的项目级 `AGENTS.md`；本文件只写本目录特有规则

# graph-engine/ — 包级规则

本文件位于包根，同时覆盖 `src/` 与 `tests/`。

## 包形态：直接消费源码，无构建产物

- `package.json` 的 `main` / `types` 指向 `./src/index.ts`，本包无构建步骤；前端经 tsconfig paths / vite alias 直接消费本包源码。
- 改 `src/index.ts` 的导出面即改前端可见 API，不存在 dist 同步环节。

## 测试

- 测试位于包根 `tests/`（`src/` 之外），vitest 只收集 `tests/**/*.test.ts`。
- 测试以相对路径 `../src/...` import 被测模块：移动或重命名 `src` 中这些路径会连锁修改测试。
- 引擎无 e2e，`tests/` 是唯一的等价性安全网——不得为通过改动而修改测试。

## 运行环境纯净

- 引擎测试跑 Node 环境；`src` 源码不得依赖 DOM / `window` / 浏览器 API 或 Vue。

## 测试夹具

- 新增测试优先复用 `tests/test_case_factory.ts`，不要各自拼装图数据。

## 公开 API 登记

- 新增或更名引擎公开标识符时，同步开发术语表；登记规范见术语表自身的编写规则。
