<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { getTodayContactBook, type ContactBookEntry } from '../api/contactBook'
import { useParentAuthStore } from '../stores/parentAuth'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { useTodayStatusCache } from '../composables/useTodayStatusCache'
import { useTodayTimeline } from '../composables/useTodayTimeline'
import { useChildSelection } from '../composables/useChildSelection'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import TodayTimeline from '../components/home-timeline/TodayTimeline.vue'
import PushCta from '../components/home/PushCta.vue'
import ChildrenStrip from '../components/home/ChildrenStrip.vue'
import LaurelWreath from '@/components/brand/LaurelWreath.vue'
import ContactBookDayCard from '../components/contact-book/ContactBookDayCard.vue'

const router = useRouter()
const authStore = useParentAuthStore()
const { selectedId: selectedStudentId, ensureSelected } = useChildSelection()

const { status: todayStatus, refresh: refreshToday } = useTodayStatusCache()
const todayStatusData = computed(() => todayStatus.value as { children?: Record<string, unknown>[] } | null)
const todayChildren = computed(() => todayStatusData.value?.children || [])

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

const selectedChild = computed(() => {
  const list: { student_id: number; name?: string; classroom_name?: string }[] = children.value || []
  return list.find((c) => c.student_id === selectedStudentId.value) || list[0] || null
})

const contactBookEntry = ref<ContactBookEntry | null>(null)
const contactBookLoading = ref(false)

async function loadContactBook(_force = false) {
  const sid = selectedChild.value?.student_id
  if (!sid) {
    contactBookEntry.value = null
    return
  }
  if (contactBookLoading.value) return
  contactBookLoading.value = true
  try {
    const res = await getTodayContactBook(sid)
    contactBookEntry.value = res.data?.entry || null
  } catch {
    contactBookEntry.value = null
  } finally {
    contactBookLoading.value = false
  }
}

onMounted(() => {
  refreshToday()
  // useCachedAsync cache-hit 時 children 從一開始就有值，下方 watch（無
  // immediate）不會 fire → 聯絡簿 hero card 永遠不會顯示。mount 時直接
  // ensureSelected + loadContactBook 涵蓋此 case（P1-16）。
  ensureSelected(children.value || [])
  loadContactBook()
})

watch(
  () => children.value?.length,
  () => {
    ensureSelected(children.value || [])
    loadContactBook()
  },
)
watch(selectedStudentId, () => loadContactBook())

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

function childStatusLabel(c: Record<string, unknown> | null | undefined) {
  if (!c) return isOffDay() ? '今天放假' : '尚未到校'
  const dismissal = c.dismissal as { status?: string } | null | undefined
  if (dismissal?.status === 'completed') return '已離園'
  const attendance = c.attendance as { status?: string } | null | undefined
  if (c.attendance) return attendance?.status || '在園中'
  if (c.leave) return '請假'
  return isOffDay() ? '今天放假' : '尚未到校'
}

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
  await Promise.all([
    refreshSummary(true),
    refreshToday(),
    loadContactBook(true),
  ])
}

function refresh() {
  refreshSummary(true)
  refreshToday()
  loadContactBook(true)
}

function go(path: string) {
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

    <!-- 今日聯絡簿 hero card：家長最關心的「孩子今天過得好嗎」 -->
    <section v-if="contactBookEntry && selectedChild" class="cb-hero">
      <div class="cb-hero-head">
        <p class="cb-hero-eyebrow">今日聯絡簿</p>
        <router-link :to="`/contact-book/${contactBookEntry.id}`" class="cb-open">
          查看完整
          <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
        </router-link>
      </div>
      <router-link
        :to="`/contact-book/${contactBookEntry.id}`"
        class="cb-card-link"
      >
        <ContactBookDayCard
          :entry="contactBookEntry"
          :student-name="selectedChild.name"
          :classroom-name="selectedChild.classroom_name"
        />
      </router-link>
    </section>

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

/* 今日聯絡簿 hero 區 */
.cb-hero { padding: 0 var(--space-4, 16px); }
.cb-hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.cb-hero-eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pt-text-soft);
}
.cb-open {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  color: var(--brand-primary, #0d9053);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
}
.cb-open .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'wght' 500;
}

.cb-card-link {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.cb-card-link:active { transform: scale(0.99); }
.cb-card-link:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 3px;
  border-radius: 20px;
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

@media (prefers-reduced-motion: reduce) {
  .cb-card-link { transition: none; }
}

@media (min-width: 420px) {
  .today-hero {
    font-size: 34px;
  }
}
</style>
