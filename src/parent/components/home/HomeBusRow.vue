<script setup lang="ts">
/**
 * 首頁娃娃車列。2026-09-02 從 TodayView 抽出，行為與抽出前逐一致（純結構搬移）。
 *
 * 兩個入口刻意並存而非合併：
 *  - 追蹤卡（連 /bus）只在班次進行中出現
 *  - 「今天不搭」是回報動作，在發車前就必須在
 */
import { computed, onMounted, ref } from 'vue'
import {
  createRideCancellation,
  getBusToday,
  getRideCancellations,
  revokeRideCancellation,
} from '../../api/bus'
import { todayTaipeiISO } from '@/utils/format'
import BusRideCancellationSheet from '../bus/BusRideCancellationSheet.vue'
import StatTile from '../StatTile.vue'

// ⬇⬇ 以下四段自 TodayView.vue:133-322 逐字搬移，含全部原始註解 ⬇⬇

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
    // 與娃娃車卡同樣策略：失敗不擋首頁其他區塊（初載失敗＝初始空值，入口單純
    // 不出現）。**不清空既有資料**：submit 成功後的重載若網路瞬斷，清空會讓
    // cancelSheetChild 變 null，sheet 連同剛拿到的「部分成功」分筆結果被整個
    // 拆掉——寧可留舊值（下一次刷新會修正），也不能把結果畫面從家長眼前抽走。
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
  // re-entrancy guard：sheet 的 `:disabled="submitting"` 要等下一輪 render 才落到
  // DOM，同一 tick 內的雙擊會重入——第二發撞後端 partial unique 回 already_active
  // （success=false），把第一發的成功結果覆寫成「此方向已有有效的取消申請」，
  // 家長誤以為沒報成。
  if (cancelSubmitting.value) return
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
  // re-entrancy guard 同 onRideCancelSubmit：撤銷鈕是直接 emit（沒有 ConfirmDialog
  // 攔一層），雙擊會發兩個 request——第二發回 404，用「撤銷失敗」蓋掉第一發
  // 已成功的事實。
  if (cancelSubmitting.value) return
  const target = cancelSheetChild.value?.cancellations.find((c) => c.id === cancellationId)
  cancelSubmitting.value = true
  try {
    await revokeRideCancellation(cancellationId)
    await loadRideCancellations()
    void loadBusToday()
    // 撤銷成功後回到選項畫面（撤銷後可再申請），不停留在結果頁
    cancelResults.value = null
  } catch (e) {
    // 失敗也要重載：不重載的話 revocable/存在性停留在過期值——404（另一位監護人
    // 或另一台裝置已先撤銷）時列表仍畫著「已回報＋撤銷鈕」，家長會一直重按。
    // 後端 detail 不外流到畫面（沿用家長端慣例），只依 status 分流成看得懂的文案。
    const status = (e as { response?: { status?: number } } | null)?.response?.status
    if (target) {
      cancelResults.value = [{
        direction: target.direction,
        ok: false,
        message: status === 404
          ? '此申報已由其他人撤銷，已為您更新狀態'
          : '撤銷失敗，該站可能已經出發',
      }]
    }
    await loadRideCancellations()
  } finally {
    cancelSubmitting.value = false
  }
}

// ⬆⬆ 搬移區塊結束 ⬆⬆

const hasAnything = computed(() => !!busInfo.value || busRideChildren.value.length > 0)

/** 供 TodayView 下拉刷新呼叫（原本 pullRefresh 直接呼叫兩支 load）。 */
async function reload(): Promise<void> {
  await Promise.all([loadBusToday(), loadRideCancellations()])
}

onMounted(() => {
  loadBusToday()
  loadRideCancellations()
})

defineExpose({ reload })
</script>

<template>
  <div v-if="hasAnything" class="home-bus-row">
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
      class="home-bus-action"
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
</template>

<style scoped>
/* 兩欄格線，與原 .today-bento 相同 */
.home-bus-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px);
}

/* 可點擊的格：StatTile 無 `to` 時只渲染靜態 div，動作型入口靠這層 button
   承接；重置 UA 樣式讓它與相鄰的 router-link 格視覺一致。 */
.home-bus-action {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
