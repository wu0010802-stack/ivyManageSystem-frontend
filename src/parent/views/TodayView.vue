<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { getTodayContactBook, type ContactBookEntry } from '../api/contactBook'
import { getBusToday } from '../api/bus'
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
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
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
// request-sequence guard：切子女時，較舊 sid 的慢回應不得覆寫最新選中子女的
// 聯絡簿。原本的 `if (contactBookLoading.value) return` 方向錯誤——A 的請求還在
// 飛行中時切到 B，B 會被 loading-guard 丟棄且不重試，畫面卡在前一個孩子；A 慢
// 回來又把 A 蓋上。改以 seq 比對只套用「最新」請求的回應（見
// composables/useLatestSearch.ts、useAbortableFetch.ts 樣板），並以 in-flight sid
// 去重，保留 mount 時 onMounted 直呼 + ensureSelected 觸發 watch 會以「同 sid」
// 呼叫兩次卻只發一次請求的行為。
let contactBookSeq = 0
let contactBookInflightSid: number | null = null

async function loadContactBook(force = false) {
  const sid = selectedChild.value?.student_id
  if (!sid) {
    contactBookSeq++ // 使任何 in-flight 回應失效
    contactBookInflightSid = null
    contactBookEntry.value = null
    return
  }
  // 同一 sid 已在請求中 → 去重（mount 雙呼）；切到「不同」子女時不去重，
  // force（下拉刷新）一律重抓。
  if (!force && contactBookInflightSid === sid) return
  const mySeq = ++contactBookSeq
  contactBookInflightSid = sid
  try {
    const res = await getTodayContactBook(sid)
    if (mySeq !== contactBookSeq) return // 已有更新請求，丟棄此舊回應
    contactBookEntry.value = res.data?.entry || null
  } catch {
    if (mySeq !== contactBookSeq) return // 較舊請求的錯誤靜默忽略
    contactBookEntry.value = null
  } finally {
    if (mySeq === contactBookSeq) contactBookInflightSid = null
  }
}

// 娃娃車入口卡：只在班次進行中才出現。首頁刻意**不**用 useBusTracking——那支
// composable 會開 WebSocket，掛在首頁等於每位家長一進 App 就多一條長連線；這裡只要
// 一次性快照即可，即時位置留給 /bus 頁。
// 隱私：回應含 stop_lat / stop_lng（＝家庭住址），只取用得到的兩個欄位，座標不進
// 首頁任何狀態。
const busInfo = ref<{ stopStatus: string; stopsAhead: number } | null>(null)
const busTileValue = computed(() => {
  if (!busInfo.value) return ''
  if (busInfo.value.stopStatus !== 'pending') return '進行中'
  return `還有 ${busInfo.value.stopsAhead} 站`
})

async function loadBusToday() {
  try {
    const res = await getBusToday()
    const data = res.data as {
      trip?: { status?: string } | null
      children?: { stop_status?: string; stops_ahead?: number }[]
    } | null // TODO(ts-strict): 待 gen:api 產出 /parent/bus/today 型別後改用 AxiosResp
    const child = data?.trip?.status === 'in_progress' ? data.children?.[0] : null
    busInfo.value = child
      ? { stopStatus: child.stop_status ?? 'pending', stopsAhead: child.stops_ahead ?? 0 }
      : null
  } catch {
    // 娃娃車卡失敗不擋首頁其他區塊（真正需要誠實降級的是 /bus 頁）
    busInfo.value = null
  }
}

onMounted(() => {
  refreshToday()
  loadBusToday()
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

/**
 * 「尚未綁定子女」須依 home-summary 的權威子女清單判定，而非 today-status：
 * today-status 可能因放假或尚未載入而為空，若據此判空，有綁定子女的家長會
 * 被誤顯示「尚未綁定子女」。
 */
const isUnbound = computed<boolean>(
  () => !!summaryData.value && (children.value || []).length === 0,
)

/** 今日卡要顯示的出席狀態（單孩取唯一那位，多寶取選中那位）。 */
const heroStatus = computed<{ label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info' }>(() => {
  const tc = todayChildren.value || []
  const target = tc.length === 1 ? tc[0] : selectedTodayChild.value
  const label = childStatusLabel(target)
  return { label, tone: childStatusTone(label) }
})

/**
 * 今日卡三態。聯絡簿不是每天都有（假日、請假、老師還沒填），
 * 但 hero 每天都要在同一個位置維持同一個形狀，所以改由 variant 驅動，
 * 不再「有 entry 才顯示卡、沒有就換一個 DashboardHero」。
 */
const todayVariant = computed<'full' | 'awaiting' | 'offday'>(() => {
  if (contactBookEntry.value) return 'full'
  const label = heroStatus.value.label
  if (label === '今天放假' || label === '請假') return 'offday'
  return 'awaiting'
})

/** 請假與放假都是 offday，但文案要分開講。 */
const todayHint = computed<string>(() =>
  heroStatus.value.label === '請假' ? '今天請假，好好休息' : '',
)

async function pullRefresh() {
  await Promise.all([
    refreshSummary(true),
    refreshToday(),
    loadContactBook(true),
    loadBusToday(),
  ])
}

function refresh() {
  refreshSummary(true)
  refreshToday()
  loadContactBook(true)
  loadBusToday()
}

function go(path: string) {
  router.push(path)
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="today-view">
    <PendingSignBanner :count="pendingSignCount" />

    <!-- 頂部：日期 + 多寶切換（單孩姓名由今日卡呈現，不重複） -->
    <div class="today-head">
      <p class="today-date">{{ todayDateLine }}</p>
      <ChildContextHeader v-if="children.length > 1" variant="hero" class="today-cch" />
    </div>

    <!--
      今日卡 = 首頁 hero。PRODUCT.md 的成功定義是「3 秒內看到孩子當日狀態」，
      所以這張卡排在所有行政事項（待繳/待簽/娃娃車）之前，且三態都佔同一個位置。
    -->
    <section v-if="isUnbound" class="cb-hero">
      <EmptyState
        variant="mobile"
        :icon="KawaiiStar"
        title="尚未綁定子女"
        description="可從右上角個人選單加綁，或請園所協助。"
      />
    </section>

    <section v-else-if="selectedChild" class="cb-hero">
      <SectionHeader title="今日聯絡簿">
        <template v-if="contactBookEntry" #action>
          <router-link :to="`/contact-book/${contactBookEntry.id}`" class="cb-open">
            查看完整
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </router-link>
        </template>
      </SectionHeader>

      <router-link
        v-if="contactBookEntry"
        :to="`/contact-book/${contactBookEntry.id}`"
        class="cb-card-link"
      >
        <ContactBookDayCard
          :entry="contactBookEntry"
          :student-name="selectedChild.name"
          :classroom-name="selectedChild.classroom_name"
          variant="full"
          :status-label="heroStatus.label"
          :status-tone="heroStatus.tone"
        />
      </router-link>

      <!-- 還沒有聯絡簿的日子：同一張卡的 awaiting / offday 態，不可點擊 -->
      <ContactBookDayCard
        v-else
        :student-name="selectedChild.name"
        :classroom-name="selectedChild.classroom_name"
        :variant="todayVariant"
        :date-line="todayDateLine"
        :status-label="heroStatus.label"
        :status-tone="heroStatus.tone"
        :hint="todayHint"
      />
    </section>

    <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

    <!-- Bento 格：行政事項，位階刻意在今日卡之下 -->
    <div v-if="feesInfo || pendingSignCount > 0 || busInfo" class="today-bento">
      <StatTile
        v-if="busInfo"
        label="娃娃車"
        :value="busTileValue"
        icon="directions_bus"
        tone="sky"
        to="/bus"
      />
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
      <SectionHeader title="今日動態">
        <!--
          今日動態只講「今天」。更長的歷史（跨 9 種來源的成長時間軸）在孩子檔案頁，
          原本要從「事務 → 孩子檔案 → 往下滑」三層才找得到，這裡補一個直達出口。
        -->
        <template v-if="selectedChild" #action>
          <router-link :to="`/children/${selectedChild.student_id}`" class="cb-open">
            更多動態
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </router-link>
        </template>
      </SectionHeader>
      <TodayTimeline :buckets="buckets" @navigate="go" />
    </section>

    <!--
      多寶家庭的孩子總覽。切換子女的主要入口是上方 ChildContextHeader，
      這條保留是因為它另外承載生日提示、在籍狀態與「進孩子檔案」入口，
      移掉會少功能；但位置下移，不與 hero 搶同一個視覺區。
    -->
    <ChildrenStrip
      v-if="children.length > 1"
      :children="children"
      :selected-id="selectedStudentId"
      @select="setSelected"
      @navigate="go"
    />

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
