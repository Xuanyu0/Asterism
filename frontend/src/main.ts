import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initTestRuntime, exposeTestRuntimeToWindow } from '@/dev/test_runtime'
import { registerTestMachine } from '@/dev/test_evaluation_machine'


import './assets/main.css'
import './assets/ui-components.css'

const app = createApp(App)    // 创建 Vue 应用
const pinia = createPinia()    // 创建 Pinia 实例

app.use(pinia)    // 先挂载 Pinia
initTestRuntime()    // Pinia 挂载后再运行测试
app.use(router)    // 再挂载路由

exposeTestRuntimeToWindow()    // 暴露开发期测试函数到浏览器控制台
registerTestMachine()    // 注册自动化验收测试机

app.mount('#app')    // 挂载应用
