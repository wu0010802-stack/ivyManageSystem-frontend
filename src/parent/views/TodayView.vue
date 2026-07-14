<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { getTodayContactBook, type ContactBookEntry } from '../api/contactBook'
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
import ChildContextHeader from '../components/ChildContextHeader.vue'
import PendingSignBanner from '../components/home/PendingSignBanner.vue'
import ContactBookDayCard from '../components/contact-book/ContactBookDayCard.vue'
import DashboardHero from '../components/DashboardHero.vue'
import StatTile from '../components/StatTile.vue'
import SectionHeader from '../components/SectionHeader.vue'

const router = useRouter()
const { selectedId: selectedStudentId, ensureSelected, setSelected } = useChildSelection()

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
    return res.data
  },
  { ttl: 60_000 },
)

const me = computed(() => summaryData.value?.me || null)
const children = computed(() => summaryData.value?.children || [])
const summary = computed(() => summaryData.value?.summary || null)
const showPushCta = computed(() => me.value && !me.value.can_push)
const pendingSignCount = computed(() => {
  const v = (summary.value as { pending_event_acks?: unknown } | null)?.pending_event_acks
  return typeof v === 'number' ? v : 0
})

// 學費：summary.fees.outstanding_count（筆數）+ outstanding（金額）
const feesInfo = computed(() => {
  const fees = (summary.value as { fees?: { outstanding_count?: number; outstanding?: number; overdue?: number } } | null)?.fees // TODO(ts-strict): waiting on backend response_model
  if (!fees || !fees.outstanding_count) return null
  return {
    count: fees.outstanding_count,
    overdue: fees.overdue ?? 0,
  }
})

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

function childStatusTone(label: string): 'ok' | 'warn' | 'danger' | 'neutral' | 'info' {
  if (label === '已入園' || label === '在園中' || label === '已離園') return 'ok'
  if (label === '請假') return 'info'
  if (label === '今天放假') return 'neutral'
  return 'neutral'
}

const selectedTodayChild = computed(() => {
  const tc = todayChildren.value || []
  return tc.find((c) => (c as { student_id?: number }).student_id === selectedStudentId.value) || null
})

const hero = computed(() => {
  const tc = todayChildren.value || []
  if (tc.length === 0) {
    if (!summaryData.value) return null
    // 「尚未綁定子女」須依 home-summary 的權威子女清單判定，而非 today-status：
    // today-status 可能因放假或尚未載入而為空，若據此判空，有綁定子女的家長會
    // 被誤顯示「尚未綁定子女」。有子女但今日無狀態時隱藏 hero（其餘區塊照常渲染）。
    if (children.value.length > 0) return null
    return {
      kind: 'empty',
      title: '尚未綁定子女',
      sub: '可從「我的」分頁加綁，或請園所協助。',
      statusLabel: null as string | null,
      statusTone: 'neutral' as const,
    }
  }
  if (tc.length === 1) {
    const c = tc[0]
    // title = 孩子姓名（來自 home-summary selectedChild），sub = 班級，statusLabel = 出席狀態
    const name = (selectedChild.value?.name ?? (c as { name?: string }).name) || '孩子'
    const classroom = (selectedChild.value?.classroom_name ?? (c as { classroom_name?: string }).classroom_name) || null
    const statusLabel = childStatusLabel(c)
    return {
      kind: 'single',
      title: name,
      sub: classroom,
      statusLabel,
      statusTone: childStatusTone(statusLabel),
    }
  }
  // 多寶家庭：title = selected 孩子姓名，sub = 班級，statusLabel = 該孩出席狀態
  // ChildContextHeader 已改為多孩才顯示，不在此重複孩子名
  const sc = selectedChild.value
  const name = sc?.name || '孩子'
  const classroom = sc?.classroom_name || null
  const statusLabel = childStatusLabel(selectedTodayChild.value)
  return {
    kind: 'multi',
    title: name,
    sub: classroom,
    statusLabel,
    statusTone: childStatusTone(statusLabel),
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
    <PendingSignBanner :count="pendingSignCount" />

    <!-- 頂部 Bento Hero：孩子姓名/班級 + 今日出席狀態 -->
    <div class="today-head">
      <p class="today-date">{{ todayDateLine }}</p>
      <!-- 多孩才顯示 ChildContextHeader；單孩姓名已由 DashboardHero title 呈現 -->
      <ChildContextHeader v-if="children.length > 1" variant="hero" class="today-cch" />

      <!-- empty 態：尚未綁定子女 -->
      <template v-if="hero?.kind === 'empty'">
        <DashboardHero
          :title="hero.title"
          :sub="hero.sub ?? undefined"
          class="today-hero-card"
        />
      </template>

      <!-- single / multi 態：title = 孩子姓名，sub = 班級，status-label = 出席狀態 -->
      <template v-else-if="hero">
        <DashboardHero
          :title="hero.title"
          :sub="hero.sub ?? undefined"
          :status-label="hero.statusLabel ?? undefined"
          :status-tone="hero.statusTone"
          class="today-hero-card"
        />
      </template>
    </div>

    <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

    <!-- Bento 格：待繳學費 + 待簽文件 -->
    <div v-if="feesInfo || pendingSignCount > 0" class="today-bento">
      <StatTile
        v-if="feesInfo"
        label="待繳學費"
        :value="`${feesInfo.count} 筆`"
        :sub="feesInfo.overdue > 0 ? '有逾期款項' : undefined"
        icon="payments"
        tone="amber"
        to="/fees"
      />
      <StatTile
        v-if="pendingSignCount > 0"
        label="待簽文件"
        :value="`${pendingSignCount} 份`"
        icon="edit_document"
        tone="coral"
        to="/events"
      />
    </div>

    <!-- 今日聯絡簿 hero card：家長最關心的「孩子今天過得好嗎」 -->
    <section v-if="contactBookEntry && selectedChild" class="cb-hero">
      <SectionHeader title="今日聯絡簿">
        <template #action>
          <router-link :to="`/contact-book/${contactBookEntry.id}`" class="cb-open">
            查看完整
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </router-link>
        </template>
      </SectionHeader>
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
      :selected-id="selectedStudentId"
      @select="setSelected"
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
      <SectionHeader title="今日動態" />
      <TodayTimeline :buckets="buckets" @navigate="go" />
    </section>

    <footer class="today-footer">
      <router-link to="/calendar" class="today-footer-link">
        <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
        <span>行事曆</span>
        <span class="material-symbols-rounded today-footer-chevron" aria-hidden="true">chevron_right</span>
      </router-link>
    </footer>
  </PullToRefresh>
</template>

<style scoped>
.today-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.today-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-6, 24px) var(--space-4, 16px) 0;
}

.today-date {
  margin: 0;
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  color: var(--pt-text-muted);
  letter-spacing: 0.02em;
}

.today-cch {
  margin-top: var(--space-1, 4px);
}

.today-hero-card {
  margin-top: var(--space-2, 8px);
}

/* Bento 格：2 欄 StatTile */
.today-bento {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px);
}

/* 今日聯絡簿 hero 區 */
.cb-hero { padding: 0 var(--space-4, 16px); }

.cb-open {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  color: var(--brand-primary, #0d9053);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  cursor: pointer;
  padding: var(--space-1, 4px) 0;
  text-decoration: none;
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
  padding: 0 var(--space-4, 16px) var(--space-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.today-footer {
  padding: 0 var(--space-4, 16px) var(--space-12, 48px);
}
.today-footer-link {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px) var(--space-5, 20px);
  border-radius: 14px;
  background: var(--m3-surface-container, #ebefe8);
  color: var(--pt-text-strong, #2a2520);
  text-decoration: none;
  font-size: var(--text-base, 15px);
  font-weight: 600;
  transition: background-color 120ms ease;
}
.today-footer-link:hover {
  background: var(--m3-surface-container-high, #e1e8df);
}
.today-footer-link .material-symbols-rounded {
  font-size: 22px;
  color: var(--brand-primary, #0d9053);
  font-variation-settings: 'wght' 500;
}
.today-footer-chevron {
  margin-left: auto;
  font-size: 20px !important;
  color: var(--pt-text-muted, #6b5e54) !important;
}

@media (prefers-reduced-motion: reduce) {
  .cb-card-link { transition: none; }
}
</style>
