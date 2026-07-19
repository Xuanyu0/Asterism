/**
 * bootstrap.ts
 *
 * 功能：
 *     开发期测试工具的总装入口。main.ts 调 bootstrapDevTools() 即可一次性
 *     注册全部开发期测试设施（加载默认测试图 + 浏览器控制台 API + 验收测试机）。
 *
 * 规则：
 *     1. 调用前必须已挂载 Pinia（app.use(pinia)），因为 initTestRuntime 内部 useGraphStore。
 *     2. 路由挂载先后不影响——本函数只挂 window 对象 + 加载测试数据，不依赖路由。
 */

import { initTestRuntime, exposeTestRuntimeToWindow } from './test_runtime'
import { registerTestMachine } from './test_evaluation_machine'

export function bootstrapDevTools(): void {
    initTestRuntime()
    exposeTestRuntimeToWindow()
    registerTestMachine()
}
