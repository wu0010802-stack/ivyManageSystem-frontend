<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useParentAuthStore } from '../stores/parentAuth'
import { getUnreadCount } from '../api/announcements'
import { getMessageUnreadCount } from '../api/messages'
import AppHeader from '../components/AppHeader.vue'
import ConnectionBanner from '../components/ConnectionBanner.vue'
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

    <div v-if="!isPublic" class="parent-conn-slot">
      <ConnectionBanner />
    </div>

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
        <span class="tab-icon-wrap">
          <span class="tab-icon-bg" aria-hidden="true" />
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
  background: var(--pt-surface-card, var(--neutral-0));
  /* 取消硬邊線改成軟陰影 + hairline，視覺更輕盈 */
  border-top: var(--pt-hairline, 1px solid var(--pt-border));
  box-shadow: 0 -4px 24px rgba(15, 23, 42, 0.06);
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
  padding: 6px 0 4px;
  font-size: var(--text-xs, 11px);
  color: var(--neutral-400, var(--pt-text-placeholder));
  text-decoration: none;
  transition: color var(--transition-fast, 0.15s ease);
}

.tab-item.active {
  color: var(--brand-primary);
  font-weight: var(--font-weight-semibold, 600);
}

.tab-item:active .tab-icon-wrap {
  transform: scale(0.92);
}

/* icon-wrap：包住 icon-bg pill + icon 本身，啟用時背景 pill 浮現 */
.tab-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 28px;
  transition: transform var(--transition-fast, 0.15s ease);
}

.tab-icon-bg {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: transparent;
  transform: scale(0.6);
  opacity: 0;
  transition:
    background var(--transition-base, 0.2s ease),
    opacity var(--transition-base, 0.2s ease),
    transform var(--transition-slow, 0.3s cubic-bezier(0.4, 0, 0.2, 1));
}

.tab-item.active .tab-icon-bg {
  background: var(--brand-primary-soft);
  opacity: 1;
  transform: scale(1);
}

.tab-icon {
  position: relative;
  z-index: 1;
  line-height: 1;
  width: var(--icon-md, 22px);
  height: var(--icon-md, 22px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tab-label {
  margin-top: 4px;
  letter-spacing: 0.02em;
}

.badge {
  position: absolute;
  top: -4px;
  right: -8px;
  background: var(--color-danger);
  color: var(--neutral-0);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--radius-full, 9999px);
  min-width: 16px;
  text-align: center;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  /* 加細白邊讓 badge 與 icon-bg 分離 */
  box-shadow: 0 0 0 2px var(--pt-surface-card, var(--neutral-0));
}

/* ConnectionBanner sticky slot：AppHeader 本身為 sticky top:0（高度約 52px + safe-area-inset-top），
   故 banner 黏在 AppHeader 之下；z-index 介於 AppHeader (--z-sticky:10) 與 tab-bar (50) 之間 */
.parent-conn-slot {
  position: sticky;
  top: calc(var(--header-height, 52px) + env(safe-area-inset-top, 0));
  z-index: 9;
}
</style>
