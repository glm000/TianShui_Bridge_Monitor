import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AppLayout from '../layout/AppLayout.vue' // 引入刚才创建的布局

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView
    },
    {
      path: '/dashboard',
      component: AppLayout, // 使用布局组件作为父路由
      meta: { requiresAuth: true }, // 需要登录才能访问
      children: [
        {
          path: '', // 默认子路由 /dashboard
          name: 'dashboard',
          component: () => import('../views/DashboardView.vue'), // 假设您有这个文件，没有的话等下创建
          meta: { title: '监测总览' },
          noPanel: true // 添加这个，禁用layout页面的 page-panel 包装
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/SettingsView.vue'),
          meta: { title: '系统设置' }
        }
        // 这里预留其他页面的坑位
        // { path: 'analysis', component: ... }
      ]
    }
  ]
})

// 简单的路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/')
  } else {
    next()
  }
})

export default router
