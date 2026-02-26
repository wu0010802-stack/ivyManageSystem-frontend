
<template>
  <el-header height="64px" class="admin-header">
    <div class="header-content">
      <div class="header-left">
        <button v-if="isMobile" class="hamburger-btn" @click="$emit('toggle-sidebar')">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <h2 class="page-title">{{ pageTitle }}</h2>
      </div>

      <div class="header-right">
        <!-- Notification Bell (optional, can be added later) -->
        
        <el-dropdown trigger="click" @command="handleCommand">
          <div class="user-profile">
            <el-avatar :size="36" class="user-avatar" icon="UserFilled" />
            <div class="user-info">
              <span class="user-name">{{ displayName }}</span>
              <span class="user-role">{{ displayRole }}</span>
            </div>
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu class="user-dropdown">
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>個人資料
              </el-dropdown-item>
              <el-dropdown-item command="settings">
                <el-icon><Setting /></el-icon>系統設定
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>登出
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </el-header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getUserInfo, clearAuth } from '@/utils/auth'

defineProps({
  isMobile: { type: Boolean, default: false }
})
defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()

const pageTitle = computed(() => route.meta?.title || '')

const userInfo = computed(() => getUserInfo() || {})
const displayName = computed(() => userInfo.value.name || '管理員')
const displayRole = computed(() => userInfo.value.role === 'admin' ? 'Administrator' : userInfo.value.role || '')

const handleCommand = (command) => {
  if (command === 'logout') {
    clearAuth()
    router.push('/login')
    ElMessage.success('已登出')
  } else if (command === 'settings') {
    router.push('/settings')
  }
}
</script>

<style scoped>
.admin-header {
  background-color: var(--surface-color);
  border-bottom: 1px solid var(--border-color-light);
  padding: 0 var(--space-8);
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-sm);
  z-index: 10;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.page-title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.user-profile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  transition: background-color var(--transition-base);
}

.user-profile:hover {
  background-color: var(--bg-color);
}

.user-avatar {
  background-color: var(--color-primary-lighter);
  color: var(--color-primary);
}

.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-primary);
}

.user-role {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* Hamburger button */
.hamburger-btn {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.hamburger-line {
  display: block;
  width: 20px;
  height: 2px;
  background-color: var(--text-primary);
  border-radius: 2px;
  transition: all var(--transition-slow);
}

@media (max-width: 767px) {
  .admin-header {
    padding: 0 var(--space-4);
  }

  .page-title {
    font-size: var(--text-lg);
  }

  .user-info {
    display: none;
  }
}
</style>
