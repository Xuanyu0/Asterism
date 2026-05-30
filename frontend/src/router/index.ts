/**
 * index.ts
 *
 * 功能：
 * 定义知识图谱前端页面路由。
 *
 * 当前 MVP：
 * 只有一个主页面：
 * KnowledgeGraphView
 *
 * 外部使用方式：
 * app.use(router)
 */

import { createRouter, createWebHistory } from 'vue-router'
import KnowledgeGraphView from '@/views/KnowledgeGraphView.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),    // 使用 HTML5 History 模式
    routes: [
        {
            path: '/',
            name: 'knowledge-graph',
            component: KnowledgeGraphView,    // 主知识图谱页面
        },
    ],
})

export default router
