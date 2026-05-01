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
  { key: 'home', label: '首頁', path: '/home' },
  { key: 'attendance', label: '出席', path: '/attendance' },
  { key: 'messages', label: '訊息', path: '/messages' },
  { key: 'announcements', label: '公告', path: '/announcements' },
  { key: 'more', label: '更多', path: '/more' },
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
          <svg
            v-if="t.key === 'home'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
          </svg>
          <svg
            v-else-if="t.key === 'attendance'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="4" y="5" width="16" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M4 11h16M8 15h2M14 15h2M8 18h2M14 18h2" />
          </svg>
          <svg
            v-else-if="t.key === 'messages'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <svg
            v-else-if="t.key === 'announcements'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 11l18-8v18l-18-8v-2z" />
            <path d="M11 14l1 6h3l-1-6" />
          </svg>
          <svg
            v-else-if="t.key === 'more'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
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
  position: relative;
  line-height: 1;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tab-icon svg {
  width: 22px;
  height: 22px;
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
