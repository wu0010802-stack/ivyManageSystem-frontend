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
import { isInLineClient } from '../utils/lineClient'

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
 * 不畫自己那條 top bar 的情況（SPEC-020 CT-M-01）：
 *
 * 1. 首頁——logo 已併入 HomeHeroHeader 的問候語 chip（見上）。
 * 2. **在 LINE App 內的主分頁**——LINE 的內建 header 不可隱藏，已提供標題
 *    （取自 document.title）與關閉鈕；我們這條的標題與 `/me` 入口都重複，
 *    而 `/me` 更已是底部 tab 之一。兩條疊起來吃掉近 120px 的首屏。
 *
 * **深層頁（`showBack`）在 LINE 內仍要保留**：LINE 內建 header 的返回鈕不是
 * 通用的「上一頁」——LIFF browser 只在 LIFF 之間轉場時才顯示它，MINI App 的
 * Return button 也未保證在所有情境出現。整條隱藏會讓深層頁只剩底部 tab 可逃，
 * 從「繳費明細」按不回「繳費」。保留時只留返回鈕，標題交給 LINE 的 header。
 *
 * 版面補償沿用既有的 `no-topbar` class，不另開一套。
 */
const headerShowBack = computed(() => route.meta?.showBack === true)

const hideOwnTopBar = computed(
  () => isHomeRoute.value || (isInLineClient() && !headerShowBack.value),
)

/**
 * LINE 內不重複顯示標題——內建 header 已經在顯示 document.title，
 * 同一串字上下相鄰出現兩次比沒有標題更糟。
 */
const showOwnTitle = computed(() => !isInLineClient())

/**
 * 點再次點 active tab → scroll-to-top。
 * 條件嚴格：必須「目前路徑等於 tab.path」才觸發；若使用者在深層頁
 * （/contact-book/123，meta.tab 仍為 'contact-book'）點聯絡簿 tab，仍應
 * 走 router 正常導回 /contact-book（不阻止預設行為）。
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
 * 但 summary 早就回傳 unread_announcements，等於每次換頁都多送請求拿
 * 已經有的數字。改走共用 composable 後，同 key 的
 * useCachedAsync 會與首頁 / 事務頁共用 cache 並 dedupe in-flight 請求，
 * 節流也由它的 60s TTL 負責（原本的 unreadThrottle 因此退場）。
 *
 * immediate: false —— 這個 layout 在 /login、/bind 等公開頁也會掛載，
 * 未登入就打 summary 會拿到 401。
 */
const { refresh: refreshSummary, contactBookTabBadge, adminTabBadge } = useHomeSummary({
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
    // 2026-08-28：親師訊息自家長端下架，這一格改放聯絡簿（公告併為其第二分頁）。
    key: 'contact-book',
    label: '聯絡簿',
    icon: 'menu_book',
    activeIcon: 'menu_book',
    path: '/contact-book',
    badge: contactBookTabBadge.value,
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
const headerTitle = computed(() =>
  showOwnTitle.value ? (route.meta?.title as string) || branding.value.titles.parent_short : '',
)

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
      v-if="!isPublic && !hideOwnTopBar"
      :title="headerTitle"
      :show-back="headerShowBack"
      :on-back="onBack"
      variant="small"
    >
      <!-- 主分頁（home/child/contact-book/admin/me）無 showBack，需要 BrandMark 補位；
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
      :class="{ 'no-topbar': hideOwnTopBar }"
    >
      <ConnectionBanner />
    </div>

    <main
      class="parent-main"
      :class="{
        'is-public': isPublic,
        'with-tabbar': !hideTabBar && !isPublic,
        'no-topbar': hideOwnTopBar && !isPublic,
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
