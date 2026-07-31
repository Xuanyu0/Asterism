/**
 * index.ts
 *
 * 功能：
 * 定义知识图谱前端页面路由。
 *
 * 当前 MVP：
 * 只有一个主页面：
 * GraphView
 */

import { createRouter, createWebHistory } from 'vue-router'
import Graph from '@/views/Graph.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),    // 使用 HTML5 History 模式
    routes: [
        {
            path: '/',
            name: 'graph',
            component: Graph,    // 主图谱页面
        },
    ],
})

export default router
