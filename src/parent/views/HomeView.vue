<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { useParentAuthStore } from '../stores/parentAuth'
import { useCachedAsync } from '@/composables/useCachedAsync'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import HomeHero from '../components/home/HomeHero.vue'
import TodayStatusCards from '../components/home/TodayStatusCards.vue'
import TodoCenter from '../components/home/TodoCenter.vue'
import ChildrenStrip from '../components/home/ChildrenStrip.vue'
import QuickActions from '../components/home/QuickActions.vue'
import PushCta from '../components/home/PushCta.vue'

const router = useRouter()
const authStore = useParentAuthStore()

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

const QUICK_ACTIONS = [
  { icon: 'notebook', label: '聯絡簿', path: '/contact-book', tint: 'contact' },
  { icon: 'calendar', label: '本週行程', path: '/calendar', tint: 'calendar' },
  { icon: 'clipboard', label: '請假', path: '/leaves', tint: 'leave' },
  { icon: 'pill', label: '用藥單', path: '/medications', tint: 'medication' },
]

// 將 6 種待辦扁平化為陣列，避免 TodoCenter 需要知道每種待辦的取數路徑。
// shape: { key, icon, tint, primaryText, count, suffix?, warn?, path }
const todos = computed(() => {
  const list = []
  if (unpaidCount.value > 0) {
    list.push({
      key: 'fees',
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
  return list
})
</script>

<template>
  <div class="home-view">
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
      <!-- 0) Hero 問候卡（ACD Phase 3.2） -->
      <HomeHero :parent-name="me?.name" :children-count="children.length" />

      <!-- 1) 推播未啟用 CTA — 暖色提醒卡 -->
      <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

      <!-- 2) 今日孩子狀態（ACD Phase 3.3） -->
      <TodayStatusCards ref="todayRef" />

      <!-- 3) 今日待辦中心（ACD Phase 3.4） -->
      <TodoCenter :todos="todos" @navigate="go" />

      <!-- 4) 我的孩子（ACD Phase 3.4） -->
      <ChildrenStrip :children="children" @navigate="go" />

      <!-- 5) 常用操作（ACD Phase 3.4） -->
      <QuickActions :actions="QUICK_ACTIONS" @navigate="go" />
    </template>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}
</style>
