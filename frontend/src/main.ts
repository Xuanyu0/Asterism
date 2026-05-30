import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initTestRuntime } from '@/dev/test_runtime'
import { exposeTestRuntimeToWindow } from './dev/test_runtime'


import './assets/main.css'

const app = createApp(App)    // 创建 Vue 应用
const pinia = createPinia()    // 创建 Pinia 实例

app.use(pinia)    // 先挂载 Pinia
initTestRuntime()    // Pinia 挂载后再运行测试
app.use(router)    // 再挂载路由

exposeTestRuntimeToWindow()    // 暴露开发期测试函数到浏览器控制台

app.mount('#app')    // 挂载应用
