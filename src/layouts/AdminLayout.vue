
<template>
  <el-container class="admin-layout" :class="{ 'is-mobile': isMobile }">
    <!-- Mobile overlay -->
    <div v-if="isMobile && sidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>

    <AdminSidebar
      :pending-approvals="notificationStore.approvalCount"
      :pending-activity-inquiries="notificationStore.activityInquiryCount"
      :is-mobile="isMobile"
      :mobile-open="sidebarOpen"
      @close-sidebar="closeSidebar"
    />

    <el-container direction="vertical" class="main-content-wrapper">
      <AdminHeader :is-mobile="isMobile" @toggle-sidebar="toggleSidebar" />

      <el-main>
        <div class="content-container">
          <RouterView />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AdminSidebar from '../components/layout/AdminSidebar.vue'
import AdminHeader from '../components/layout/AdminHeader.vue'
import { isLoggedIn } from '@/utils/auth'
import { useNotificationStore } from '@/stores/notification'

const route = useRoute()
const notificationStore = useNotificationStore()
const isMobile = ref(false)
const sidebarOpen = ref(false)

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) sidebarOpen.value = false
}

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const closeSidebar = () => {
  sidebarOpen.value = false
}

// AdminLayout 即使被 App.vue 用 v-else 守住仍可能在 router 尚未 resolve 的
// 初次 mount 短暫渲染，這時 route.path 還是 START_LOCATION ('/')。為避免
// 公開頁/教師端/登入頁打到 admin-only 的 /api/notifications/summary，
// 這裡再守一道 path-based guard。
function isAdminContext(path: string): boolean {
  return (
    !path.startsWith('/public') &&
    !path.startsWith('/portal') &&
    path !== '/login' &&
    path !== '/change-password'
  )
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  if (isLoggedIn() && isAdminContext(route.path)) notificationStore.fetchSummary()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

watch(() => route.path, (path: string) => {
  if (isLoggedIn() && isAdminContext(path)) notificationStore.fetchSummary()
})
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  background-color: var(--bg-color);
}

.main-content-wrapper {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.el-main {
  padding: 0;
  overflow-y: auto;
  background-color: var(--bg-color);
}

.content-container {
  padding: var(--space-8);
  max-width: 1600px;
  margin: 0 auto;
}

/* Mobile overlay */
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(2px);
  z-index: 1999;
}

@media (max-width: 767px) {
  .content-container {
    padding: var(--space-4);
  }
}
</style>
