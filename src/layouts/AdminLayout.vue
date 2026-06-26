
<template>
  <el-container class="admin-layout" :class="{ 'is-mobile': isMobile }">
    <!-- Mobile overlay -->
    <div v-if="isMobile && sidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>

    <AdminSidebar
      :pending-approvals="notificationStore.approvalCount"
      :pending-activity-inquiries="notificationStore.activityInquiryCount"
      :pending-high-risk-audit="unackHighRiskCount"
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
import { useHighRiskAuditCount } from '@/composables/useHighRiskAuditCount'
import { useIsMobile } from '@/composables/useIsMobile'

const NOTIFICATION_POLL_MS = 60_000

const route = useRoute()
const notificationStore = useNotificationStore()
const { unackCount: unackHighRiskCount } = useHighRiskAuditCount()
const { isMobile } = useIsMobile()
const sidebarOpen = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

// 離開手機視窗時關閉手機側欄（原 checkMobile 的副作用）
watch(isMobile, (m) => {
  if (!m) sidebarOpen.value = false
})

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

function refreshNotifications() {
  if (isLoggedIn() && isAdminContext(route.path)) notificationStore.fetchSummary()
}

// 輪詢專用 callback：背景分頁（document.hidden）時跳過，省後端負載 / quota
// （對照 useHighRiskAuditCount）。切回前景後下一個 tick 自然恢復。
function pollNotifications() {
  if (typeof document !== 'undefined' && document.hidden) return
  refreshNotifications()
}

onMounted(() => {
  // admin 品牌色 scope（design-tokens.css / main.css 的 html.ivy-admin 區塊）；
  // 掛在 <html> 讓 teleport 到 body 的 dialog/message 也吃到
  document.documentElement.classList.add('ivy-admin')
  refreshNotifications()
  // Why: 切頁不再觸發 fetchSummary（避免每次 navigation 多一支 API 等待），改用
  // 固定 60 秒輪詢；store 本身有 10s TTL + in-flight dedupe 守住，重複請求不會炸後端。
  pollTimer = setInterval(pollNotifications, NOTIFICATION_POLL_MS)
})

onUnmounted(() => {
  document.documentElement.classList.remove('ivy-admin')
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
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

@media (--to-sm) {
  .content-container {
    padding: var(--space-4);
  }
}
</style>
