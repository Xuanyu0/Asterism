import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// 加载 dev bootstrap 模块（副作用：挂载 window.bootstrapDevTools）。
// 种子注入不再随启动自动执行——需在浏览器控制台手动调用 bootstrapDevTools()。
import '@/dev/bootstrap'

import './assets/main.css'
import './assets/ui-components.css'

const app = createApp(App)

app.use(router)

app.mount('#app')
