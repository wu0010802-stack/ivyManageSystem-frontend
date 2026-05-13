<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { useParentAuthStore } from '../stores/parentAuth'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { useTodayStatusCache } from '../composables/useTodayStatusCache'
import { useTodayTimeline } from '../composables/useTodayTimeline'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import TodayTimeline from '../components/home-timeline/TodayTimeline.vue'
import PushCta from '../components/home/PushCta.vue'
import ChildrenStrip from '../components/home/ChildrenStrip.vue'
import LaurelWreath from '@/components/brand/LaurelWreath.vue'

const router = useRouter()
const authStore = useParentAuthStore()

const IA_V2_BANNER_KEY = 'parent_ia_v2_migration_banner_seen'
const showMigrationBanner = ref(false)

const { status: todayStatus, refresh: refreshToday } = useTodayStatusCache()
const todayChildren = computed(() => todayStatus.value?.children || [])

const {
  data: summaryData,
  error: summaryError,
  pending: summaryPending,
  refresh: refreshSummary,
} = useCachedAsync(
  'parent/today/summary',
  async () => {
    const res = await getHomeSummary()
    if (res.data?.me) authStore.setUser(res.data.me)
    return res.data
  },
  { ttl: 60_000 },
)

const me = computed(() => summaryData.value?.me || null)
const children = computed(() => summaryData.value?.children || [])
const summary = computed(() => summaryData.value?.summary || null)
const showPushCta = computed(() => me.value && !me.value.can_push)

onMounted(() => {
  refreshToday()
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

const { buckets } = useTodayTimeline({ summary, todayChildren })

const todayDayLabel = computed(() => {
  const d = new Date()
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
})
const weekdayLabel = computed(() => {
  const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()]
  return `星期${wd}`
})
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早安'
  if (h < 14) return '午安'
  if (h < 18) return '下午好'
  return '晚安'
})

async function pullRefresh() {
  await Promise.all([refreshSummary(true), refreshToday()])
}

function refresh() {
  refreshSummary(true)
  refreshToday()
}

function go(path) {
  router.push(path)
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="today-view">
    <header class="today-head">
      <LaurelWreath
        side="right"
        :opacity="0.08"
        :size="132"
        class="today-laurel"
        aria-hidden="true"
      />
      <span class="today-weekday">{{ weekdayLabel }}</span>
      <h1 class="today-day">{{ todayDayLabel }}</h1>
      <p class="today-greeting">
        {{ greeting }}，{{ me?.name || '家長' }}
      </p>
    </header>

    <div
      v-if="showMigrationBanner"
      class="ia-banner"
      role="status"
    >
      <span>公告／出席已移至底部「家校」分頁</span>
      <button
        type="button"
        class="ia-banner-close"
        aria-label="關閉"
        @click="dismissBanner"
      >×</button>
    </div>

    <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

    <ChildrenStrip
      v-if="children.length > 1"
      :children="children"
      @navigate="go"
    />

    <template v-if="summaryPending && !summaryData">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" />
        <SkeletonBlock variant="card" />
        <SkeletonBlock variant="card" />
      </div>
    </template>

    <MobileErrorRetry
      v-else-if="summaryError && !summaryData"
      :error="summaryError"
      @retry="refresh"
    />

    <section v-else class="today-stream">
      <TodayTimeline :buckets="buckets" @navigate="go" />
    </section>
  </PullToRefresh>
</template>

<style scoped>
.today-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.today-head {
  position: relative;
  padding: var(--space-8, 32px) var(--space-4, 16px) var(--space-4, 16px);
  overflow: hidden;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}
.today-laurel {
  position: absolute;
  right: -32px;
  bottom: -36px;
  z-index: -1;
}
.today-weekday {
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  color: var(--brand-primary);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.today-day {
  margin: 0;
  font-size: var(--text-4xl, 32px);
  font-weight: 900;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--pt-text-strong);
}
.today-greeting {
  margin: var(--space-2, 8px) 0 0;
  font-size: var(--text-base, 15px);
  color: var(--pt-text-muted);
  font-weight: 600;
}

.ia-banner {
  margin: 0 var(--space-4, 16px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: var(--brand-tint-yellow, #fff7d6);
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  color: var(--pt-text-strong);
}
.ia-banner-close {
  background: transparent;
  border: 0;
  font-size: 18px;
  line-height: 1;
  padding: 0 var(--space-2, 8px);
  cursor: pointer;
  color: var(--pt-text-muted);
  min-height: var(--touch-target-min, 44px);
  min-width: var(--touch-target-min, 44px);
}

.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: 0 var(--space-4, 16px);
}

.today-stream {
  padding: var(--space-2, 8px) var(--space-4, 16px) var(--space-12, 48px);
}

@media (min-width: 420px) {
  .today-day {
    font-size: 38px;
  }
}
</style>
