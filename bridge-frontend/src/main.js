/* src/main.js */
import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 1. 引入 Element Plus 及其样式文件
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'

import './assets/main.css' // 保持默认样式引用，防报错

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 2. 告诉 Vue 我们要用 Element Plus
app.use(ElementPlus)

app.mount('#app')
