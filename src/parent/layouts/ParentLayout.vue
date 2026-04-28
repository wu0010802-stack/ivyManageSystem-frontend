<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useParentAuthStore } from '../stores/parentAuth'
import { getUnreadCount } from '../api/announcements'
import { getMessageUnreadCount } from '../api/messages'

const route = useRoute()
const router = useRouter()
const authStore = useParentAuthStore()

const isPublic = computed(() => route.meta?.public === true)
const hideTabBar = computed(() => route.meta?.hideTabBar === true)
const currentTab = computed(() => route.meta?.tab || '')

const unread = ref(0)
const unreadMessages = ref(0)

// Phase 3: Tab Bar 重排 — 請假 demote 到「更多」，新增「訊息」tab
const TABS = [
  { key: 'home', icon: '🏠', label: '首頁', path: '/home' },
  { key: 'attendance', icon: '📋', label: '出席', path: '/attendance' },
  { key: 'messages', icon: '💬', label: '訊息', path: '/messages' },
  { key: 'announcements', icon: '📢', label: '公告', path: '/announcements' },
  { key: 'more', icon: '⋯', label: '更多', path: '/more' },
]

async function refreshUnread() {
  if (!authStore.isAuthed()) return
  try {
    const [{ data: a }, { data: m }] = await Promise.all([
      getUnreadCount(),
      getMessageUnreadCount(),
    ])
    unread.value = a?.unread_count || 0
    unreadMessages.value = m?.unread_count || 0
  } catch {
    /* ignore */
  }
}

onMounted(refreshUnread)
watch(() => route.fullPath, refreshUnread)
</script>

<template>
  <div class="parent-layout">
    <header v-if="!isPublic" class="parent-header">
      <span class="parent-header-title">{{ route.meta?.title || '常春藤家長' }}</span>
    </header>

    <main class="parent-main" :class="{ 'is-public': isPublic, 'with-tabbar': !hideTabBar && !isPublic }">
      <slot />
    </main>

    <nav v-if="!hideTabBar && !isPublic" class="tab-bar">
      <router-link
        v-for="t in TABS"
        :key="t.key"
        :to="t.path"
        class="tab-item"
        :class="{ active: currentTab === t.key }"
      >
        <span class="tab-icon">
          {{ t.icon }}
          <span v-if="t.key === 'announcements' && unread > 0" class="badge">
            {{ unread > 99 ? '99+' : unread }}
          </span>
          <span v-if="t.key === 'messages' && unreadMessages > 0" class="badge">
            {{ unreadMessages > 99 ? '99+' : unreadMessages }}
          </span>
        </span>
        <span class="tab-label">{{ t.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
.parent-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100%;
}

.parent-header {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3f7d48;
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  padding-top: env(safe-area-inset-top, 0);
}

.parent-header-title {
  letter-spacing: 1px;
}

.parent-main {
  flex: 1;
  padding: 16px;
}

.parent-main.is-public {
  padding: 0;
}

.parent-main.with-tabbar {
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0));
}

.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  padding-bottom: env(safe-area-inset-bottom, 0);
  z-index: 50;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  font-size: 11px;
  color: #888;
  text-decoration: none;
}

.tab-item.active {
  color: #3f7d48;
}

.tab-icon {
  font-size: 20px;
  position: relative;
  line-height: 1;
}

.tab-label {
  margin-top: 2px;
}

.badge {
  position: absolute;
  top: -6px;
  right: -10px;
  background: #c0392b;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
  line-height: 1.4;
}
</style>
