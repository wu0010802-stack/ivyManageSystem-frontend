<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useParentAuthStore } from '../stores/parentAuth'
import { useHomeSummary } from '../composables/useHomeSummary'
import M3TopAppBar from '../components/m3/M3TopAppBar.vue'
import M3NavigationBar from '../components/m3/M3NavigationBar.vue'
import M3IconButton from '../components/m3/M3IconButton.vue'
import ConnectionBanner from '../components/ConnectionBanner.vue'
import BrandMark from '@/components/brand/BrandMark.vue'
import ParentOfflineIndicator from '../components/ParentOfflineIndicator.vue'
import { useTenantBranding } from '@/composables/useTenantBranding'

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
 * 首頁改版（2026-08-17）：只有 /home 本身拿掉頂部 sticky bar，logo 併入
 * HomeHeroHeader 的問候語 chip。同分頁（tab: 'home'）底下的次頁面
 * （/bus、/calendar，皆 showBack: true）仍需要返回鍵與標題，不受影響——
 * 故用 route.name 精準比對，不能只看 currentTab === 'home'。
 */
const isHomeRoute = computed(() => route.name === 'parent-home')

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

/**
 * tab 徽章全部取自 home/summary 這一支。
 *
 * 這裡原本另外打 announcements/unread-count 與 messages/unread-count 兩支，
 * 但 summary 早就同時回傳 unread_announcements 與 unread_messages，等於每次
 * 換頁都多送兩個請求拿已經有的數字。改走共用 composable 後，同 key 的
 * useCachedAsync 會與首頁 / 事務頁共用 cache 並 dedupe in-flight 請求，
 * 節流也由它的 60s TTL 負責（原本的 unreadThrottle 因此退場）。
 *
 * immediate: false —— 這個 layout 在 /login、/bind 等公開頁也會掛載，
 * 未登入就打 summary 會拿到 401。
 */
const { refresh: refreshSummary, messagesTabBadge, adminTabBadge } = useHomeSummary({
  immediate: false,
})

const TABS = computed<TabItem[]>(() => [
  {
    key: 'home',
    label: '首頁',
    icon: 'home',
    activeIcon: 'home',
    path: '/home',
  },
  {
    key: 'child',
    label: '孩子',
    icon: 'child_care',
    activeIcon: 'child_care',
    path: '/child',
  },
  {
    key: 'messages',
    label: '訊息',
    icon: 'chat_bubble',
    activeIcon: 'chat_bubble',
    path: '/messages',
    badge: messagesTabBadge.value,
  },
  {
    key: 'admin',
    label: '事務',
    icon: 'assignment',
    activeIcon: 'assignment',
    path: '/admin',
    badge: adminTabBadge.value,
  },
  {
    key: 'me',
    label: '我的',
    icon: 'account_circle',
    activeIcon: 'account_circle',
    path: '/me',
  },
])

function refreshBadges() {
  if (!authStore.isAuthed()) return
  refreshSummary()
}

onMounted(() => refreshBadges())
watch(() => route.fullPath, () => refreshBadges())

const { branding } = useTenantBranding()
const headerTitle = computed(() => (route.meta?.title as string) || branding.value.titles.parent_short)
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
      v-if="!isPublic && !isHomeRoute"
      :title="headerTitle"
      :show-back="headerShowBack"
      :on-back="onBack"
      variant="small"
    >
      <!-- 主分頁（home/child/messages/admin/me）無 showBack，需要 BrandMark 補位；
           深層頁有 back button 不用蓋。CLAUDE.md 列為 polish 階段 acceptance：
           保留 LaurelWreath/CrownIcon brand。bug sweep round 4 (2026-05-14) F-FE-3。 -->
      <template v-if="!headerShowBack" #leading>
        <BrandMark variant="mini" :size="28" />
      </template>
      <template #actions>
        <!-- P2 IA 重整（2026-08-14）：頭像不再開抽屜，直接導向常駐「我的」tab。
             MeDrawer 的全部功能（個人資料/通知偏好/加綁子女/登出）已存在於 /me 頁，
             元件檔案保留一個 release 週期再清除，見 spec §7。 -->
        <M3IconButton
          icon="account_circle"
          aria-label="我的"
          @click="router.push('/me')"
        />
      </template>
    </M3TopAppBar>

    <div
      v-if="!isPublic"
      class="parent-conn-slot"
      :class="{ 'no-topbar': isHomeRoute }"
    >
      <ConnectionBanner />
    </div>

    <main
      class="parent-main"
      :class="{
        'is-public': isPublic,
        'with-tabbar': !hideTabBar && !isPublic,
        'no-topbar': isHomeRoute && !isPublic,
      }"
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
/* 首頁沒有頂部 sticky bar（64px），banner 直接貼齊頂端 */
.parent-conn-slot.no-topbar {
  top: 0;
}

.parent-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.parent-main.with-tabbar {
  padding-bottom: 80px;
}
/* 首頁沒有頂部 sticky bar 吸收瀏海／狀態列安全區，補回這段 padding，
   避免 HomeHeroHeader 內容被裝置瀏海遮住 */
.parent-main.no-topbar {
  padding-top: env(safe-area-inset-top, 0);
}

.parent-navbar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky, 10);
  /*
   * WCAG AA 對比修正：active indicator pill 改用品牌綠，確保對 nav bar (#f4f7fa) 有 ≥3:1 對比。
   * 預設 --m3-secondary-container 是 #d2e8d4（暖綠），或被覆寫成 #e7edf3（過淺無對比）。
   * 改用 --brand-primary（#0d9053）一致品牌感且達 AA。
   * --m3-on-secondary-container 改白色：白 icon 於深綠 pill 約 4.1:1（非文字 ≥3:1 AA Pass）；
   * active label 走 --m3-on-surface（深色於近白 bar），token 不同，不受此覆寫影響。
   */
  --m3-secondary-container: var(--brand-primary, #0d9053);
  --m3-on-secondary-container: var(--m3-on-primary, #ffffff);
}
</style>
