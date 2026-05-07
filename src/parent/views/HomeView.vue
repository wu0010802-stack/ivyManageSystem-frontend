<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { useParentAuthStore } from '../stores/parentAuth'
import { useCachedAsync } from '@/composables/useCachedAsync'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import HomeHero from '../components/home/HomeHero.vue'
import TodayStatusCards from '../components/home/TodayStatusCards.vue'
import TodoCenter from '../components/home/TodoCenter.vue'
import PushCta from '../components/home/PushCta.vue'

const router = useRouter()
const authStore = useParentAuthStore()

// IA v2 Phase 3：公告／出席 從獨立 tab 降為「家校」分頁子項目，
// 對既有家長加一次性 banner 引導。flag 寫在 dismiss 時（reload 仍會看到 → 較溫和）。
const IA_V2_BANNER_KEY = 'parent_ia_v2_migration_banner_seen'
const showMigrationBanner = ref(false)

onMounted(() => {
  if (typeof window !== 'undefined' && !localStorage.getItem(IA_V2_BANNER_KEY)) {
    showMigrationBanner.value = true
  }
})

function dismissBanner() {
  showMigrationBanner.value = false
  if (typeof window !== 'undefined') {
    localStorage.setItem(IA_V2_BANNER_KEY, '1')
  }
}

// summary 走 60s 快取（待辦變動慢）；today 狀態移到 TodayStatusCards 內，由 useTodayStatusCache 自管
const {
  data: summaryData,
  error: summaryError,
  pending: summaryPending,
  refresh: refreshSummary,
} = useCachedAsync(
  'parent/home/summary',
  async () => {
    const res = await getHomeSummary()
    if (res.data?.me) authStore.setUser(res.data.me)
    return res.data
  },
  { ttl: 60_000 },
)

const todayRef = ref(null)

const me = computed(() => summaryData.value?.me || null)
const children = computed(() => summaryData.value?.children || [])
const summary = computed(() => summaryData.value?.summary || null)

const fees = computed(() => summary.value?.fees || null)
const unpaidCount = computed(() => fees.value?.outstanding_count || 0)
const unpaidTotal = computed(() => fees.value?.outstanding || 0)
const overdueAmount = computed(() => fees.value?.overdue || 0)
const unreadAnnouncements = computed(() => summary.value?.unread_announcements || 0)
const pendingAcks = computed(() => summary.value?.pending_event_acks || 0)
const unreadMessages = computed(() => summary.value?.unread_messages || 0)
const pendingPromotions = computed(() => summary.value?.pending_activity_promotions || 0)
const recentLeaveReviews = computed(() => summary.value?.recent_leave_reviews || 0)

const showPushCta = computed(() => me.value && !me.value.can_push)

function formatMoney(n) {
  if (!n) return '0'
  return n.toLocaleString('en-US')
}

function go(path) {
  router.push(path)
}

function refresh() {
  refreshSummary(true)
  todayRef.value?.refresh()
}

// 下拉刷新：等兩支 API 都完成才結束 indicator
async function pullRefresh() {
  await Promise.all([
    refreshSummary(true),
    todayRef.value?.refresh(),
  ])
}

// 將 6 種待辦扁平化為陣列，避免 TodoCenter 需要知道每種待辦的取數路徑。
// shape: { key, icon, tint, primaryText, count, suffix?, warn?, path }
const todos = computed(() => {
  const list = []
  if (unpaidCount.value > 0) {
    list.push({
      key: overdueAmount.value > 0 ? 'fees_overdue' : 'fees',
      icon: 'money',
      tint: 'money',
      path: '/fees',
      primaryText: '待繳費',
      count: unpaidCount.value,
      suffix: ` 筆 ／ NT$ ${formatMoney(unpaidTotal.value)}`,
      warn: overdueAmount.value > 0
        ? `（逾期 NT$ ${formatMoney(overdueAmount.value)}）`
        : null,
    })
  }
  if (unreadMessages.value > 0) {
    list.push({
      key: 'messages',
      icon: 'chat',
      tint: 'message',
      path: '/messages',
      primaryText: '未讀訊息',
      count: unreadMessages.value,
      suffix: ' 則',
    })
  }
  if (pendingAcks.value > 0) {
    list.push({
      key: 'acks',
      icon: 'signature',
      tint: 'event',
      path: '/events',
      primaryText: '待簽閱事件',
      count: pendingAcks.value,
      suffix: ' 件',
    })
  }
  if (unreadAnnouncements.value > 0) {
    list.push({
      key: 'announcements',
      icon: 'megaphone',
      tint: 'announcement',
      path: '/announcements',
      primaryText: '未讀公告',
      count: unreadAnnouncements.value,
      suffix: ' 則',
    })
  }
  if (recentLeaveReviews.value > 0) {
    list.push({
      key: 'leaveReviews',
      icon: 'clipboard',
      tint: 'leave',
      path: '/leaves',
      primaryText: '最近請假審核結果',
      count: recentLeaveReviews.value,
      suffix: ' 件',
    })
  }
  if (pendingPromotions.value > 0) {
    list.push({
      key: 'promotions',
      icon: 'art',
      tint: 'activity',
      path: '/activity',
      primaryText: '才藝候補待確認',
      count: pendingPromotions.value,
      suffix: ' 件',
    })
  }
  // IA v2 Phase 3：依時效/重要性排序，逾期繳費置頂、請假審核結果墊底
  const KEY_PRIORITY = {
    fees_overdue: 0,
    acks: 1,
    fees: 2,
    messages: 3,
    promotions: 4,
    announcements: 5,
    leaveReviews: 6,
  }
  list.sort((a, b) => (KEY_PRIORITY[a.key] ?? 99) - (KEY_PRIORITY[b.key] ?? 99))
  return list
})
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="home-view">
    <!-- IA v2 Phase 3：一次性遷移提示，與 summary 載入狀態無關，需獨立於下方分支之外 -->
    <div v-if="showMigrationBanner" class="ia-banner" role="status">
      <span class="ia-banner-text">📢 公告／出席已移至底部「家校」分頁</span>
      <button type="button" class="ia-banner-close" aria-label="關閉" @click="dismissBanner">×</button>
    </div>

    <!-- 骨架載入：>300ms 的非同步請求應顯示結構，避免畫面空白 -->
    <template v-if="summaryPending && !summaryData">
      <SkeletonBlock variant="card" />
      <SkeletonBlock variant="card" />
      <SkeletonBlock variant="card" />
    </template>

    <MobileErrorRetry
      v-else-if="summaryError && !summaryData"
      :error="summaryError"
      @retry="refresh"
    />

    <template v-else-if="summaryData">
      <!-- 1) 推播未啟用 CTA — 暖色提醒卡（置頂警示） -->
      <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

      <!-- 2) Hero 問候卡 -->
      <HomeHero
        :parent-name="me?.name"
        :children-count="children.length"
        :todo-count="todos.length"
      />

      <!-- 3) 今日待辦中心（首頁靈魂） -->
      <TodoCenter :todos="todos" @navigate="go" />

      <!-- 4) 今日孩子狀態 -->
      <TodayStatusCards ref="todayRef" />
    </template>
  </PullToRefresh>
</template>

<style scoped>
.home-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.ia-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3, 12px);
  background: var(--brand-tint-yellow, #fff7d6);
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-strong, var(--neutral-900));
}
.ia-banner-text { flex: 1; }
.ia-banner-close {
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  padding: 0 var(--space-2, 8px);
  cursor: pointer;
  color: var(--pt-text-muted);
  min-height: var(--touch-target-min, 44px);
  min-width: var(--touch-target-min, 44px);
}
</style>
