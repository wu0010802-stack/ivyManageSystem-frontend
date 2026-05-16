<script setup>
import { computed, onMounted } from 'vue'
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
})

const { buckets } = useTodayTimeline({ summary, todayChildren })

const todayDateLine = computed(() => {
  const d = new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日　星期${wd}`
})

function isOffDay() {
  const d = new Date().getDay()
  return d === 0 || d === 6
}

function childStatusLabel(c) {
  if (!c) return isOffDay() ? '今天放假' : '尚未到校'
  if (c.dismissal?.status === 'completed') return '已離園'
  if (c.attendance) return c.attendance.status || '在園中'
  if (c.leave) return '請假'
  return isOffDay() ? '今天放假' : '尚未到校'
}

// hero = 今日狀態（以孩子為主角，不是問候家長）
const hero = computed(() => {
  const tc = todayChildren.value || []
  if (tc.length === 0) {
    if (!summaryData.value) return null
    return {
      kind: 'empty',
      label: '尚未綁定子女',
      note: '可從「我的」分頁加綁，或請園所協助。',
    }
  }
  if (tc.length === 1) {
    const c = tc[0]
    return {
      kind: 'single',
      label: childStatusLabel(c),
      note: [c.name, c.classroom_name].filter(Boolean).join('　·　') || null,
    }
  }
  return {
    kind: 'multi',
    label: `今天 ${tc.length} 位小朋友`,
    note: null,
  }
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
      <p class="today-date">{{ todayDateLine }}</p>
      <h1 v-if="hero" class="today-hero">{{ hero.label }}</h1>
      <p v-if="hero?.note" class="today-note">{{ hero.note }}</p>
    </header>

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
  padding: 28px var(--space-4, 16px) var(--space-3, 12px);
  overflow: hidden;
  isolation: isolate;
  display: flex;
  flex-direction: column;
}
.today-laurel {
  position: absolute;
  right: -32px;
  bottom: -36px;
  z-index: -1;
}
.today-date {
  margin: 0;
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  color: var(--pt-text-muted);
  letter-spacing: 0.02em;
}
.today-hero {
  margin: var(--space-2, 8px) 0 0;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: var(--pt-text-strong);
}
.today-note {
  margin: var(--space-2, 8px) 0 0;
  font-size: var(--text-base, 15px);
  color: var(--pt-text-muted);
  font-weight: 500;
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
  .today-hero {
    font-size: 34px;
  }
}
</style>
