<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useParentAuthStore } from '../stores/parentAuth'
import { getUnreadCount } from '../api/announcements'
import { getMessageUnreadCount } from '../api/messages'
import M3TopAppBar from '../components/m3/M3TopAppBar.vue'
import M3NavigationBar from '../components/m3/M3NavigationBar.vue'
import M3IconButton from '../components/m3/M3IconButton.vue'
import ConnectionBanner from '../components/ConnectionBanner.vue'
import BrandMark from '@/components/brand/BrandMark.vue'
import MeDrawer from '../components/layout/MeDrawer.vue'
import ParentOfflineIndicator from '../components/ParentOfflineIndicator.vue'

interface TabItem {
  key: string
  label: string
  icon: string
  activeIcon: string
  path: string
  badge?: number
}

const route = useRoute()
const router = useRouter()
const authStore = useParentAuthStore()

const isPublic = computed(() => route.meta?.public === true)
const hideTabBar = computed(() => route.meta?.hideTabBar === true)
const currentTab = computed(() => (route.meta?.tab as string) || '')

/**
 * 點再次點 active tab → scroll-to-top。
 * 條件嚴格：必須「目前路徑等於 tab.path」才觸發；若使用者在深層頁
 * （/messages/123，meta.tab 仍為 'messages'）點 messages tab，仍應
 * 走 router 正常導回 /messages（不阻止預設行為）。
 */
function onTabSelect(_key: string, item: { key: string; icon: string; label: string; badge?: number; path?: string }) {
  if (route.path === item.path) {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    return
  }
  if (item.path) router.push(item.path)
}

const unread = ref(0)
const unreadMessages = ref(0)

const TABS = computed<TabItem[]>(() => [
  {
    key: 'home',
    label: '首頁',
    icon: 'home',
    activeIcon: 'home',
    path: '/home',
  },
  {
    key: 'messages',
    label: '訊息',
    icon: 'chat_bubble',
    activeIcon: 'chat_bubble',
    path: '/messages',
    badge: unreadMessages.value + unread.value,
  },
  {
    key: 'admin',
    label: '事務',
    icon: 'assignment',
    activeIcon: 'assignment',
    path: '/admin',
  },
])

const drawerOpen = ref(false)

async function refreshUnread() {
  if (!authStore.isAuthed()) return
  try {
    const [{ data: a }, { data: m }] = await Promise.all([
      getUnreadCount(),
      getMessageUnreadCount(),
    ])
    unread.value = (a as Record<string, unknown>)?.unread_count as number || 0
    unreadMessages.value = (m as Record<string, unknown>)?.unread_count as number || 0
  } catch {
    /* ignore */
  }
}

onMounted(refreshUnread)
watch(() => route.fullPath, refreshUnread)

const headerTitle = computed(() => route.meta?.title as string || '常春藤家長')
const headerShowBack = computed(() => route.meta?.showBack === true)

function onBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/home')
  }
}
</script>

<template>
  <div class="parent-layout">
    <M3TopAppBar
      v-if="!isPublic"
      :title="headerTitle"
      :show-back="headerShowBack"
      :on-back="onBack"
      variant="small"
    >
      <!-- 主分頁（home/messages/admin）無 showBack，需要 BrandMark 補位；
           深層頁有 back button 不用蓋。CLAUDE.md 列為 polish 階段 acceptance：
           保留 LaurelWreath/CrownIcon brand。bug sweep round 4 (2026-05-14) F-FE-3。 -->
      <template v-if="!headerShowBack" #leading>
        <BrandMark variant="mini" :size="28" />
      </template>
      <template #actions>
        <M3IconButton
          icon="account_circle"
          aria-label="開啟個人選單"
          @click="drawerOpen = true"
        />
      </template>
    </M3TopAppBar>

    <MeDrawer v-if="!isPublic" v-model="drawerOpen" />

    <div v-if="!isPublic" class="parent-conn-slot">
      <ConnectionBanner />
    </div>

    <main
      class="parent-main"
      :class="{ 'is-public': isPublic, 'with-tabbar': !hideTabBar && !isPublic }"
    >
      <slot />
    </main>

    <M3NavigationBar
      v-if="!hideTabBar && !isPublic"
      class="parent-navbar"
      :items="TABS"
      :current-key="currentTab"
      @select="onTabSelect"
    />

    <!-- 離線同步狀態 indicator：position:fixed 浮於底部，不受頁面 transition 影響 -->
    <ParentOfflineIndicator />
  </div>
</template>

<style scoped>
.parent-layout {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  width: 100%;
  max-width: var(--pt-app-max-width, 560px);
  margin: 0 auto;
  position: relative;
}

.parent-conn-slot {
  position: sticky;
  top: 64px;
  z-index: 9;
}

.parent-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.parent-main.with-tabbar {
  padding-bottom: 80px;
}

.parent-navbar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky, 10);
  /*
   * Bento 冷調收尾：在冷石板底色上，M3 active indicator pill 改用
   * slate-tinted secondary-container，使 active tab 對比更清晰且與 surface 色調一致。
   * 預設 --m3-secondary-container 是 #d2e8d4（暖綠），在 slate #eef1f5 上輕微色調衝突。
   * --m3-on-secondary-container 維持深綠以保留品牌感。
   */
  --m3-secondary-container: var(--m3-surface-container-highest, #e7edf3);
  --m3-on-secondary-container: var(--m3-on-surface, #0f172a);
}
</style>
