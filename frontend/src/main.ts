import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { bootstrapDevTools } from '@/dev/bootstrap'


import './assets/main.css'
import './assets/ui-components.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
bootstrapDevTools()
app.use(router)

app.mount('#app')
