<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { DataAnalysis, Monitor, Setting, User, Fold, Expand, SwitchButton, Bell } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()

const isCollapse = ref(false)

const handleLogout = () => {
  ElMessageBox.confirm('确定要退出系统吗?', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      localStorage.removeItem('token')
      ElMessage.success('已安全退出')
      router.push('/')
    })
    .catch(() => {})
}

const activeMenu = computed(() => route.path)
</script>

<template>
  <el-container class="layout-container">
    <!-- 1. 左侧侧边栏 -->
    <el-aside :width="isCollapse ? '64px' : '240px'" class="app-sidebar">
      <!-- Logo 区域 -->
      <div class="sidebar-logo" :class="{ collapsed: isCollapse }">
        <!-- 修复后的 SVG：正方形 ViewBox，留有边距，防止被切 -->
        <svg viewBox="0 0 120 120" class="logo-svg">
          <!-- 底部桥面 -->
          <path d="M10 90 H110" stroke="#40f3ff" stroke-width="10" stroke-linecap="round" />
          <!-- 拱形 -->
          <path d="M15 90 Q60 20 105 90" fill="none" stroke="#40f3ff" stroke-width="10" stroke-linecap="round" />
          <!-- 中间竖线 (悬索) -->
          <path d="M60 45 V90 M35 65 V90 M85 65 V90" stroke="#40f3ff" stroke-width="8" stroke-linecap="round" />
        </svg>

        <span v-if="!isCollapse" class="logo-text">桥梁监测系统</span>
      </div>

      <!-- 菜单区域 -->
      <el-menu active-text-color="#40f3ff" background-color="#0d1a33" class="el-menu-vertical" :default-active="activeMenu" text-color="#a0b4ce" :collapse="isCollapse" :collapse-transition="false" router>
        <el-menu-item index="/dashboard">
          <el-icon><Monitor /></el-icon>
          <span>监测总览</span>
        </el-menu-item>

        <el-menu-item index="/dashboard/analysis">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据分析</span>
        </el-menu-item>

        <el-menu-item index="/dashboard/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>

        <el-menu-item index="/dashboard/settings">
          <el-icon><Setting /></el-icon>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 2. 右侧主体区域 -->
    <el-container>
      <!-- 顶部 Header -->
      <el-header class="app-header">
        <div class="header-left">
          <el-icon class="trigger-btn" @click="isCollapse = !isCollapse">
            <component :is="isCollapse ? Expand : Fold" />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ route.meta.title || '当前页面' }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <el-tooltip content="系统消息" placement="bottom">
            <div class="icon-btn">
              <el-badge is-dot class="item">
                <el-icon><Bell /></el-icon>
              </el-badge>
            </div>
          </el-tooltip>

          <el-dropdown trigger="click">
            <div class="user-info">
              <img src="https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png" class="user-avatar" />
              <span class="user-name">管理员 Admin</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>个人中心</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区域 Main -->
      <el-main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>

      <el-footer class="app-footer">© 2026 陕西三为云测智能科技有限公司 - Bridge Health Monitor System</el-footer>
    </el-container>
  </el-container>
</template>

<style scoped>
/* ========== 全局颜色修正 ========== */
.layout-container {
  height: 100vh;
  width: 100vw;
  color: #333; /* 【重要】强制设置全局文字颜色为深灰，避免被登录页的白色继承影响 */
}

/* ========== 左侧侧边栏 ========== */
.app-sidebar {
  background-color: #0d1a33;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  transition: width 0.3s;
  display: flex;
  flex-direction: column;
  overflow-x: hidden; /* 防止收缩时文字溢出 */
}

.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center; /* 居中对齐 */
  background: rgba(0, 0, 0, 0.1);
  white-space: nowrap;
  padding: 0 10px; /* 增加一点内边距 */
  overflow: hidden;
}

/* 修复后的 SVG 样式 */
.logo-svg {
  width: 32px; /* 设为正方形 */
  height: 32px;
  margin-right: 12px;
  flex-shrink: 0; /* 【重要】防止 flex 布局将其压扁 */
  filter: drop-shadow(0 0 5px rgba(64, 243, 255, 0.5)); /* 发光效果 */
}

.sidebar-logo.collapsed .logo-svg {
  margin-right: 0;
}

.logo-text {
  color: #fff;
  font-weight: bold;
  font-size: 16px;
  letter-spacing: 1px;
  opacity: 1;
  transition: opacity 0.3s;
}

/* 菜单样式 */
.el-menu-vertical {
  border-right: none;
  background-color: transparent;
}
:deep(.el-menu-item) {
  margin: 4px 0;
}
:deep(.el-menu-item:hover) {
  background-color: rgba(64, 243, 255, 0.1) !important;
}
:deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(64, 201, 255, 0.15) 0%, transparent 100%) !important;
  border-left: 3px solid #40f3ff;
  color: #fff !important;
  text-shadow: 0 0 10px rgba(64, 243, 255, 0.5);
}
:deep(.el-menu-item .el-icon) {
  font-size: 18px;
}

/* ========== 顶部 Header ========== */
.app-header {
  background-color: #fff;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  z-index: 10;
  color: #333; /* 确保 header 文字也是黑色的 */
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}
.trigger-btn {
  font-size: 20px;
  cursor: pointer;
  transition: 0.3s;
}
.trigger-btn:hover {
  color: #409eff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}
.icon-btn {
  font-size: 20px;
  color: #666;
  cursor: pointer;
  height: 24px;
}
.icon-btn:hover {
  color: #409eff;
}

.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: 0.3s;
}
.user-info:hover {
  background: #f5f7fa;
}
.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  margin-right: 8px;
  border: 1px solid #eee;
}
.user-name {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

/* ========== 内容区域 ========== */
.app-main {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}

/* 页面切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ========== 底部 ========== */
.app-footer {
  height: 40px;
  line-height: 40px;
  text-align: center;
  font-size: 12px;
  color: #999;
  background: #f0f2f5;
}
</style>
