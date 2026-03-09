
<template>
  <el-container class="admin-layout" :class="{ 'is-mobile': isMobile }">
    <!-- Mobile overlay -->
    <div v-if="isMobile && sidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>

    <AdminSidebar
      :pending-approvals="approvalStore.pendingTotal"
      :is-mobile="isMobile"
      :mobile-open="sidebarOpen"
      @close-sidebar="closeSidebar"
    />

    <el-container direction="vertical" class="main-content-wrapper">
      <AdminHeader :is-mobile="isMobile" @toggle-sidebar="toggleSidebar" />

      <el-main>
        <div class="content-container">
          <RouterView v-slot="{ Component }">
            <transition name="fade-transform" mode="out-in">
              <component :is="Component" />
            </transition>
          </RouterView>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AdminSidebar from '../components/layout/AdminSidebar.vue'
import AdminHeader from '../components/layout/AdminHeader.vue'
import { isLoggedIn } from '@/utils/auth'
import { useApprovalStore } from '@/stores/approval'

const route = useRoute()
const approvalStore = useApprovalStore()
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

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  if (isLoggedIn()) approvalStore.fetchSummary()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

watch(() => route.path, () => {
  if (isLoggedIn()) approvalStore.fetchSummary()
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

/* Page Transitions */
.fade-transform-enter-active,
.fade-transform-leave-active {
  transition: all var(--transition-slow);
}

.fade-transform-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-transform-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 767px) {
  .content-container {
    padding: var(--space-4);
  }
}
</style>
