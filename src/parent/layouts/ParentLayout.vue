<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useParentAuthStore } from '../stores/parentAuth'
import { getUnreadCount } from '../api/announcements'
import { getMessageUnreadCount } from '../api/messages'
import AppHeader from '../components/AppHeader.vue'
import ParentIcon from '../components/ParentIcon.vue'

const route = useRoute()
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
    <AppHeader v-if="!isPublic" />

    <main class="parent-main" :class="{ 'is-public': isPublic, 'with-tabbar': !hideTabBar && !isPublic }">
      <slot />
    </main>

    <nav v-if="!hideTabBar && !isPublic" class="tab-bar" aria-label="主要功能">
      <router-link
        v-for="t in TABS"
        :key="t.key"
        :to="t.path"
        class="tab-item"
        :class="{ active: currentTab === t.key }"
        :aria-current="currentTab === t.key ? 'page' : null"
      >
        <span class="tab-icon">
          <ParentIcon :name="t.key" size="md" />
          <span
            v-if="t.key === 'announcements' && unread > 0"
            class="badge"
            :aria-label="`未讀公告 ${unread > 99 ? '超過 99' : unread} 則`"
          >
            {{ unread > 99 ? '99+' : unread }}
          </span>
          <span
            v-if="t.key === 'messages' && unreadMessages > 0"
            class="badge"
            :aria-label="`未讀訊息 ${unreadMessages > 99 ? '超過 99' : unreadMessages} 則`"
          >
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
  min-height: 100dvh;
  width: 100%;
}

.parent-main {
  flex: 1;
  padding: var(--space-4, 16px);
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
  background: var(--neutral-0);
  border-top: 1px solid var(--neutral-200, var(--pt-border));
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  padding-bottom: env(safe-area-inset-bottom, 0);
  z-index: var(--z-tab-bar, 50);
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px) 0;
  font-size: var(--text-xs, 11px);
  color: var(--neutral-400, var(--pt-text-placeholder));
  text-decoration: none;
  transition: color var(--transition-fast, 0.15s ease);
}

.tab-item.active {
  color: var(--brand-primary);
}

.tab-item:active {
  background: var(--neutral-50, var(--pt-surface-mute-soft));
}

.tab-icon {
  position: relative;
  line-height: 1;
  width: var(--icon-md, 22px);
  height: var(--icon-md, 22px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tab-label {
  margin-top: 2px;
}

.badge {
  position: absolute;
  top: -6px;
  right: -10px;
  background: var(--color-danger);
  color: var(--neutral-0);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
</style>
