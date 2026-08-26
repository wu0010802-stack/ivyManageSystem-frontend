<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeSummary } from '../api/profile'
import { getTodayContactBook, type ContactBookEntry } from '../api/contactBook'
import {
  createRideCancellation,
  getBusToday,
  getRideCancellations,
  revokeRideCancellation,
} from '../api/bus'
import BusRideCancellationSheet from '../components/bus/BusRideCancellationSheet.vue'
import { todayTaipeiISO } from '@/utils/format'
import { listPickupAuthorizations } from '../api/pickup'
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
import PendingSurveyBanner from '../components/home/PendingSurveyBanner.vue'
import StatTile from '../components/StatTile.vue'
import SectionHeader from '../components/SectionHeader.vue'
import { listMySignRequests } from '../api/signDocuments'
import HomeHeroHeader from '../components/home/HomeHeroHeader.vue'
import QuickActionsBar from '../components/home/QuickActionsBar.vue'

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
const pendingSurveyCount = computed(() => {
  const v = (summary.value as { pending_survey_count?: unknown } | null)?.pending_survey_count
  return typeof v === 'number' ? v : 0
})

// 入學文件電子簽署（esign01）：與既有 pendingSignCount（事件簽閱，導向
// /events）為不同功能，刻意用不同變數名與標籤避免首頁出現兩個「待簽文件」
// tile 導向不同頁面的混淆。home summary 尚未聚合此欄位（不動既有共用
// endpoint），改用獨立輕量請求。
const pendingSignDocCount = ref(0)
async function loadPendingSignDocCount() {
  try {
    const { data } = await listMySignRequests()
    pendingSignDocCount.value = data.pending.length
  } catch {
    pendingSignDocCount.value = 0
  }
}

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

// request-sequence guard：下拉刷新與重試可能重疊觸發 loadBusToday（見
// onMounted / pullRefresh / refresh 三個呼叫點），較舊的回應可能晚到覆蓋較新
// 的回應，讓「還有 N 站」小卡短暫顯示過期資訊。做法與上方 loadContactBook 的
// seq guard 相同：只套用最新一次呼叫的結果，較舊的回應（含錯誤）一律丟棄。
let busSeq = 0

async function loadBusToday() {
  const mySeq = ++busSeq
  try {
    const res = await getBusToday()
    if (mySeq !== busSeq) return // 已有更新請求，丟棄此舊回應
    const data = res.data as {
      trip?: { status?: string } | null
      children?: { stop_status?: string; stops_ahead?: number }[]
    } | null // TODO(ts-strict): 待 gen:api 產出 /parent/bus/today 型別後改用 AxiosResp
    const child = data?.trip?.status === 'in_progress' ? data.children?.[0] : null
    busInfo.value = child
      ? { stopStatus: child.stop_status ?? 'pending', stopsAhead: child.stops_ahead ?? 0 }
      : null
  } catch {
    if (mySeq !== busSeq) return // 較舊請求的錯誤靜默忽略
    // 娃娃車卡失敗不擋首頁其他區塊（真正需要誠實降級的是 /bus 頁）
    busInfo.value = null
  }
}

// ── 娃娃車「今天不搭」入口（FE-PARENT-04，spec「家長端」第 1 點）──
//
// 為什麼**不能**沿用上面的 busInfo 當顯示條件：`GET /parent/bus/today` 依 spec
// 「家長端」第 3 點排除 planned／expired，無班次時整包回空。家長最需要回報不搭的
// 時段（前一晚 ~ 當天發車前）恰好是它的空窗——掛在 busInfo 底下等於入口只在車
// 已經上路後才出現，早上接車永遠來不及報。
// `GET /parent/bus/ride-cancellations` 的資料來自預設名單（bus_route_stops），
// 與 trip 生命週期無關，那個空窗也答得出來，故入口改吃它。
type BusDirection = 'morning' | 'afternoon'
interface BusRideChild {
  student_id: number
  student_name: string
  scheduled_directions: BusDirection[]
  cancellations: Array<{ id: number; direction: BusDirection; revocable: boolean }>
}

const DIRECTION_SHORT: Record<BusDirection, string> = {
  morning: '早上接車',
  afternoon: '下午送車',
}

const busRideChildren = ref<BusRideChild[]>([])

// seq guard 同 loadBusToday／loadContactBook：下拉刷新與 sheet 送出後的重載
// 可能重疊，較舊的回應晚到會讓入口顯示過期的「已回報」狀態。
let rideCancelSeq = 0
async function loadRideCancellations() {
  const mySeq = ++rideCancelSeq
  try {
    const res = await getRideCancellations()
    if (mySeq !== rideCancelSeq) return
    const data = res.data as { children?: BusRideChild[] } | null
    // TODO(ts-strict): 待後端 bussch07 合流後重跑 gen:api 即可改用 AxiosResp
    busRideChildren.value = data?.children ?? []
  } catch {
    if (mySeq !== rideCancelSeq) return
    // 與娃娃車卡同樣策略：失敗不擋首頁其他區塊，入口單純不出現
    busRideChildren.value = []
  }
}

const cancelSheetStudentId = ref<number | null>(null)
const cancelSubmitting = ref(false)
const cancelResults = ref<Array<{ direction: BusDirection; ok: boolean; message: string }> | null>(null)

const cancelSheetChild = computed<BusRideChild | null>(
  () => busRideChildren.value.find((c) => c.student_id === cancelSheetStudentId.value) ?? null,
)

/** 入口副標：已回報哪些方向；沒有就不顯示副標。 */
function rideCancelSummary(child: BusRideChild): string | undefined {
  if (child.cancellations.length === 0) return undefined
  return `${child.cancellations.map((c) => DIRECTION_SHORT[c.direction]).join('、')}已回報`
}

function openCancelSheet(studentId: number): void {
  cancelResults.value = null
  cancelSheetStudentId.value = studentId
}

function closeCancelSheet(): void {
  cancelSheetStudentId.value = null
  cancelResults.value = null
}

/**
 * 送出「今天不搭」。「整天」是**同一個 request 帶兩個 direction**，後端逐方向
 * 各自跑 savepoint 並回一組 results——早上已接走、下午仍可取消時是部分成功，
 * 必須把兩筆結果原樣交給 sheet 逐方向呈現（spec「整天部分失敗語意」），不可
 * 收斂成單一成功/失敗。
 */
async function onRideCancelSubmit(directions: BusDirection[]): Promise<void> {
  const child = cancelSheetChild.value
  if (!child || directions.length === 0) return
  cancelSubmitting.value = true
  try {
    const res = await createRideCancellation({
      student_id: child.student_id,
      // **必須是 todayTaipeiISO 而不是 todayISO**：後端 RideCancellationCreateIn
      // 以 `today_taipei()` 驗 date window，裝置在 UTC+9 時台北 23:10 送出的
      // todayISO() 是「明天」——落在 +7 天 window 內照收，但明天的 trip 還沒生成
      // → 後端回 no_stop → 前端顯示成功文案，家長以為報成了，隔天車照常來接。
      // 裝置在美洲時區則會送出「昨天」→ 422 → 重試永遠不會好。
      date: todayTaipeiISO(),
      directions,
    })
    const payload = res.data as {
      results?: Array<{ direction: BusDirection; success: boolean; message: string }>
    } | null
    cancelResults.value = (payload?.results ?? []).map((r) => ({
      direction: r.direction,
      ok: r.success,
      message: r.message,
    }))
    await loadRideCancellations()
    void loadBusToday()
  } catch {
    // 後端訊息不外流到畫面（沿用家長端慣例）；逐方向給同一句，維持分筆形狀
    cancelResults.value = directions.map((d) => ({
      direction: d,
      ok: false,
      message: '回報失敗，請稍後再試',
    }))
  } finally {
    cancelSubmitting.value = false
  }
}

/**
 * 撤銷。正常情況下 sheet 已依 `revocable` 收掉按鈕，這裡的失敗是競態
 * （拿到列表之後車才開走，後端回 422）——必須呈現而非靜默，否則家長會以為
 * 撤銷成功、照常在家等車。
 */
async function onRideCancelRevoke(cancellationId: number): Promise<void> {
  const target = cancelSheetChild.value?.cancellations.find((c) => c.id === cancellationId)
  cancelSubmitting.value = true
  try {
    await revokeRideCancellation(cancellationId)
    await loadRideCancellations()
    void loadBusToday()
    // 撤銷成功後回到選項畫面（撤銷後可再申請），不停留在結果頁
    cancelResults.value = null
  } catch {
    if (target) {
      cancelResults.value = [{
        direction: target.direction,
        ok: false,
        message: '撤銷失敗，該站可能已經出發',
      }]
    }
  } finally {
    cancelSubmitting.value = false
  }
}

// 臨時接送快捷卡：今日進行中授權筆數（跨全部小孩）。失敗不擋首頁其他區塊。
const pickupActiveCount = ref(0)
async function loadPickupToday() {
  try {
    const res = await listPickupAuthorizations({ status: 'active' })
    const items = (res.data as { items?: unknown[] })?.items || []
    pickupActiveCount.value = items.length
  } catch {
    pickupActiveCount.value = 0
  }
}

onMounted(() => {
  refreshToday()
  loadBusToday()
  loadRideCancellations()
  loadPickupToday()
  // useCachedAsync cache-hit 時 children 從一開始就有值，下方 watch（無
  // immediate）不會 fire → 聯絡簿 hero card 永遠不會顯示。mount 時直接
  // ensureSelected + loadContactBook 涵蓋此 case（P1-16）。
  ensureSelected(children.value || [])
  loadContactBook()
  loadPendingSignDocCount()
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

/** QuickActionsBar 聯絡簿大按鈕要顯示的出席狀態（單孩取唯一那位，多寶取選中那位）。 */
const heroStatus = computed<{ label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info' }>(() => {
  const tc = todayChildren.value || []
  const target = tc.length === 1 ? tc[0] : selectedTodayChild.value
  const label = childStatusLabel(target)
  return { label, tone: childStatusTone(label) }
})

/**
 * 聯絡簿三態，決定 contactBookSub 的文案該講什麼。原本另外驅動一張獨立
 * 的「今日聯絡簿」hero 卡（cb-hero），2026-08-16 業主裁定該卡與 QuickActionsBar
 * 的聯絡簿大按鈕（含出席狀態 pill）重複，整塊移除；三態判斷邏輯本身還在用
 * （見下方 contactBookSub），故保留。
 */
const todayVariant = computed<'full' | 'awaiting' | 'offday'>(() => {
  if (contactBookEntry.value) return 'full'
  const label = heroStatus.value.label
  if (label === '今天放假' || label === '請假') return 'offday'
  return 'awaiting'
})

/**
 * 常用功能列（quickact01，2026-08-16 改版）的聯絡簿大按鈕連結／副標。
 * 有今天的紀錄就直連該筆；沒有的話連去列表，副標依三態給對應文案，
 * 呼應 ContactBookDayCard 原本的 awaiting/offday 語意，不重造一套判斷。
 */
const contactBookHref = computed<string>(() =>
  contactBookEntry.value ? `/contact-book/${contactBookEntry.value.id}` : '/contact-book',
)
const contactBookSub = computed<string>(() => {
  if (contactBookEntry.value) return '查看今天的完整紀錄'
  if (todayVariant.value === 'offday') {
    return heroStatus.value.label === '請假' ? '今天請假，暫無紀錄' : '今天放假，暫無紀錄'
  }
  return '老師還沒有寫今天的紀錄'
})

async function pullRefresh() {
  await Promise.all([
    refreshSummary(true),
    refreshToday(),
    loadContactBook(true),
    loadBusToday(),
    loadRideCancellations(),
  ])
}

function refresh() {
  refreshSummary(true)
  refreshToday()
  loadContactBook(true)
  loadBusToday()
  loadRideCancellations()
}

function go(path: string) {
  router.push(path)
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="today-view">
    <PendingSignBanner :count="pendingSignCount" />
    <PendingSurveyBanner :count="pendingSurveyCount" />

    <!--
      首頁頂部 hero（2026-08-16 改版）：問候語 chip（早中晚＋插畫）+ 孩子近期
      照片輪播 + 姓名 + 日期/班級，取代原本的純問候語列。多寶切換沿用既有
      ChildContextHeader，接在後面。
    -->
    <HomeHeroHeader
      v-if="selectedChild"
      :student-id="selectedChild.student_id"
      :name="selectedChild.name || ''"
      :classroom-name="selectedChild.classroom_name"
    />
    <ChildContextHeader v-if="children.length > 1" variant="hero" class="today-cch" />

    <!--
      常用功能列（quickact01，2026-08-16 改版）：聯絡簿大按鈕 + 三個模組
      按鈕，家長各自在自己手機上編輯、存 DB（QuickActionsBar 內部自己
      fetch /parent/quick-actions，不經 home-summary）。位在今日卡之上，
      但聯絡簿大按鈕本身帶出席狀態 pill，「3 秒內看到孩子當日狀態」的
      既有承諾不受影響。
    -->
    <QuickActionsBar
      v-if="selectedChild"
      :contact-book-href="contactBookHref"
      :contact-book-sub="contactBookSub"
      :status-label="heroStatus.label"
      :status-tone="heroStatus.tone"
    />

    <!--
      刻意不用共用的 @/components/common/EmptyState：那支沒被 pin 進 vite.config
      的 shared-common，落在 admin-core chunk。首頁是家長端 entry 的首屏，靜態
      import 它會把整包 admin-core 拖進首屏（實測 gz 227.9KB → 492.0KB，
      check-entry-chunks gate 直接擋下 build）。lazy route（如 ContactBookView）
      用它沒問題，首屏元件不行。
    -->
    <section v-if="isUnbound" class="cb-hero">
      <div class="unbound">
        <p class="unbound-title">尚未綁定子女</p>
        <p class="unbound-desc">可從右上角個人選單加綁，或請園所協助。</p>
      </div>
    </section>

    <!--
      2026-08-16 業主裁定移除：原本這裡有一張獨立的「今日聯絡簿」hero 卡
      （ContactBookDayCard）＋下方「我要接小孩」CTA（pnotice01），與上面
      QuickActionsBar 的聯絡簿大按鈕（本身已帶出席狀態 pill、連去聯絡簿）
      及「接送」快捷模組重複，故整塊拿掉。contactBookEntry / todayVariant
      等底層狀態邏輯仍保留，餵給 QuickActionsBar 的 contactBookHref /
      contactBookSub props（見上方 script）。
    -->

    <PushCta v-if="showPushCta" @enable="go('/notifications/preferences')" />

    <!-- Bento 格：行政事項，位階刻意在今日卡之下 -->
    <div
      v-if="
        feesInfo || pendingSignCount > 0 || pendingSignDocCount > 0 || busInfo
          || pickupActiveCount > 0 || busRideChildren.length > 0
      "
      class="today-bento"
    >
      <StatTile
        v-if="busInfo"
        label="娃娃車"
        :value="busTileValue"
        icon="directions_bus"
        tone="sky"
        to="/bus"
      />
      <!--
        「今天不搭」入口：逐子女一格（多寶家庭各自回報）。刻意與上面的娃娃車
        追蹤卡並存而非合併——那格連到 /bus 追蹤頁、只在班次進行中出現，這格是
        回報動作、在發車前就必須在。
      -->
      <button
        v-for="rideChild in busRideChildren"
        :key="`ride-cancel-${rideChild.student_id}`"
        type="button"
        class="today-bento-action"
        :data-testid="`bus-ride-cancel-${rideChild.student_id}`"
        @click="openCancelSheet(rideChild.student_id)"
      >
        <StatTile
          label="今天不搭"
          :value="rideChild.student_name"
          :sub="rideCancelSummary(rideChild)"
          icon="event_busy"
          tone="sky"
        />
      </button>
      <StatTile
        v-if="pickupActiveCount > 0"
        label="臨時接送"
        :value="`${pickupActiveCount} 筆進行中`"
        icon="hail"
        tone="leaf"
        to="/pickup"
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
      <StatTile
        v-if="pendingSignDocCount > 0"
        label="入學文件簽署"
        :value="`${pendingSignDocCount} 份`"
        icon="history_edu"
        tone="brand"
        to="/sign"
      />
    </div>

    <BusRideCancellationSheet
      v-if="cancelSheetChild"
      :visible="true"
      :child-name="cancelSheetChild.student_name"
      :scheduled-directions="cancelSheetChild.scheduled_directions"
      :active-cancellations="cancelSheetChild.cancellations"
      :submitting="cancelSubmitting"
      :results="cancelResults"
      @submit="onRideCancelSubmit"
      @revoke="onRideCancelRevoke"
      @close="closeCancelSheet"
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

.today-cch {
  margin-top: var(--space-1, 4px);
  padding: 0 var(--space-4, 16px);
}

/* 可點擊的 bento 格（StatTile 本身無 `to` 時只渲染靜態 div，動作型入口靠這層
   button 承接；重置 UA 樣式讓它與相鄰的 router-link 格視覺一致）。 */
.today-bento-action {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
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

/* 尚未綁定子女（首屏不引入共用 EmptyState，見 template 註解） */
.unbound {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-8, 32px) var(--space-5, 20px);
  text-align: center;
  background: var(--cream, #fffcf2);
  border: 1px solid rgba(13, 144, 83, 0.12);
  border-radius: 20px;
}
.unbound-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--pt-text-strong);
}
.unbound-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--pt-text-muted);
}

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
</style>
