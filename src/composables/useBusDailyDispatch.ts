/**
 * 管理端娃娃車「今日調度」（`/bus/dispatch` 專用，非 module singleton）。
 *
 * spec「當日計畫生命週期」：`GET /bus/daily-plans` 是**懶生成＋冪等**的——光是
 * 開這一頁就會替每條啟用班次生成當日 `planned` 計畫。因此本檔的 `load()` 不是
 * 唯讀查詢，換日期就是一次寫入，不可以放在 watch 裡隨手重打。
 *
 * ── 與 `useBusRouteEditor` 的關鍵差異 ──────────────────────────────────────
 *
 * 1. **沒有編輯緩衝**。班次設定頁是 replace-all（整批送出、可以先排好再存），
 *    當日名單是**增量 PATCH**（`inserts`／`excuse`／`reorder`…），而且車可能正在
 *    路上跑——本地緩衝跟伺服器分岔十分鐘，套用時就是拿過期的世界觀覆寫現況。
 *    故每個動作都立即送出、以回應為準重填，沒有 `dirty` 也沒有「未儲存」確認。
 *
 * 2. **權限是雙碼且依 trip.status 分流**（spec「daily-plans 寫入端點守衛形狀」）：
 *    `planned` 要 `BUS_WRITE`、`in_progress` 要 `BUS_IN_PROGRESS_WRITE`，兩者
 *    不互相蘊含（只給發車後調整權的行政不該能改隔天的計畫）。前端這份判斷是
 *    **UI 鏡像**，用來把無權的動作先鎖起來；真正的守門一律是後端 403。
 *
 * 3. **`completed`／`expired` 全面唯讀**（spec 生命週期第 7 點）。後端對這兩態
 *    直接 409，前端不送。
 *
 * ── 誠實降級（沿用監看頁與班次設定頁的同一條原則）────────────────────────
 * 載入失敗時 `plans` 是空的，但那**不是**「今天沒有班次」——`loadFailed` 獨立
 * 一個旗標，讓 view 以錯誤卡取代空狀態。畫面不得把「連不上」講成「沒有車」。
 *
 * ── 隱私 ────────────────────────────────────────────────────────────────────
 * 站點回應含 `lat`/`lng`（接送地址 geocode 快照）、`address` 與聯絡人電話。
 * 範圍依 spec「前端（admin）模組拆分」為「保留本頁需要的欄位」——但一律**不得**
 * 進 console／Sentry／URL query／localStorage／sessionStorage。本檔因此完全沒有
 * console 與 storage 呼叫，錯誤訊息也只取後端 detail 不夾帶座標。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getBusDailyPlan,
  listBusRoutes,
  optimizeBusDailyPlan,
  patchBusDailyPlanStops,
  resetBusDailyPlan,
} from '@/api/bus'
import { getStudents } from '@/api/students'
import type { ApiBody, Schema } from '@/api/_generated/typed'
import { STUDENT_PAGE_SIZE, type BusDirection } from '@/composables/useBusRouteEditor'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { dateToLocalISO, parseLocalISODate, todayTaipeiISO } from '@/utils/format'

/** 與後端 `api/bus/daily_plans.py::MAX_DAYS_AHEAD` 對齊（今天~+7，超界 422）。 */
export const MAX_DAYS_AHEAD = 7

/** 翻頁保險絲：後端 total 異常時不至於變成無窮迴圈（比照 useBusRouteEditor）。 */
const MAX_STUDENT_PAGES = 20

/**
 * 後端 `BusStopAdminOut` **去掉座標**（型別仍由 codegen 衍生，不手抄欄位）。
 *
 * 本頁從頭到尾沒有一處讀 `stop.lat`/`stop.lng`——地圖微調與插入用的座標一律來自
 * `BusPickupAddressSelect` 的 `resolved` 事件，不是站點資料。既然不需要，就**不要
 * 讓它進狀態**：`@sentry/vue`（本專案 10.62.0）預設 `attachProps: true`，任何
 * render error 都會把元件 props 整包塞進 `contexts.vue.propsData`，而
 * `src/utils/sentry.ts` 的 denylist 有 `address`／`student_name`／`phone`，
 * **沒有 `lat`/`lng`**——一次未預期的渲染錯誤就會把全車學生家門口的六位小數座標
 * 送上 Sentry。過濾不如不帶：少一個欄位，就少一條外洩路徑。
 *
 * （`useBusMonitor` 與班次設定頁確實需要座標畫地圖，那兩處的 Sentry denylist 缺口
 * 要另外補；見交付說明的 follow-up。）
 */
export type DispatchStop = Omit<Schema<'BusStopAdminOut'>, 'lat' | 'lng'>

/** 丟掉座標（見 `DispatchStop`）。後端回應的其餘欄位原樣保留。 */
function stripCoordinates(stops: Schema<'BusStopAdminOut'>[]): DispatchStop[] {
  return stops.map(({ lat: _lat, lng: _lng, ...rest }) => rest)
}

/**
 * 一條班次的當日計畫。後端 `DailyPlanItemOut` 加上兩個**只有班次表才有**的欄位
 * （`route_name`／`depart_time`）——daily-plans 回應刻意不重複班次設定，班次名稱
 * 得由 `GET /bus/routes` 併入。
 */
export interface DispatchPlan {
  trip: Schema<'DailyPlanTripOut'>
  stops: DispatchStop[]
  calendar_warnings: string[]
  capacity: number
  /**
   * 載入當下的 `eta_may_be_stale`。**不要直接讀這個**——它只是伺服器快照，
   * 之後的編輯不會更新它（`DailyPlanStopsPatchOut`／`DailyPlanResetOut` 都不回
   * 這個欄位）。要判斷 ETA 是否過期請用 composable 的 `etaStale`。
   */
  eta_may_be_stale: boolean
  route_name: string
  direction: BusDirection
  depart_time: string
}

/**
 * 載客數＝`departed + pending`（excused／skipped 不計）。
 *
 * **從 stops 現算而不存欄位**：後端只有 `GET /daily-plans` 與 PATCH 的回應帶
 * `capacity.departed_pending`，`POST …/reset` 的 `DailyPlanResetOut` 沒有——存成
 * 欄位就會出現「重設後名單顯示 2 人、班次卡片還寫 0 人、超載警示不亮」。
 * 算式與後端 `daily_plans.py` 的 `sum(1 for st in ... if st.status in ("departed","pending"))`
 * 同口徑。
 */
export function departedPendingCount(stops: readonly DispatchStop[]): number {
  return stops.filter((s) => s.status === 'departed' || s.status === 'pending').length
}

/** `GET /bus/routes` 中本頁需要的欄位；名冊與座標不進狀態（隱私）。 */
interface RouteMeta {
  name: string
  direction: BusDirection
  depart_time: string
}

type PatchPayload = ApiBody<'/bus/daily-plans/{trip_id}/stops', 'patch'>
type OptimizePreviewOut = Schema<'DailyPlanOptimizePreviewOut'>

function asDirection(value: string): BusDirection {
  return value === 'afternoon' ? 'afternoon' : 'morning'
}

/**
 * `base` 之後第 `days` 天（`YYYY-MM-DD`）。用 `parseLocalISODate` 而非
 * `new Date('YYYY-MM-DD')`：後者依規格解成 UTC 午夜，台北 +8 會位移到當日上午，
 * 月底加天數時會少一天。
 */
function isoPlusDays(base: string, days: number): string {
  const d = parseLocalISODate(base)
  if (!d) return base
  d.setDate(d.getDate() + days)
  return dateToLocalISO(d)
}

export function useBusDailyDispatch() {
  const date = ref<string>(todayTaipeiISO())
  const plans = ref<DispatchPlan[]>([])
  const selectedTripId = ref<number | null>(null)
  const loading = ref(true)
  /** 任一寫入動作 in-flight；view 用來 disable 整組編輯避免併發送出。 */
  const saving = ref(false)
  /**
   * 當日計畫載入失敗：`plans` 是空的，但**不是**「今天沒有班次」。
   * 與監看頁 `snapshotFailed` 同一條原則。
   */
  const loadFailed = ref(false)
  /** 自動排序預覽（`apply: false` 的回應），按「套用」前不落庫。 */
  const optimizePreviewData = ref<OptimizePreviewOut | null>(null)
  const optimizing = ref(false)
  const optimizeError = ref<string | null>(null)
  /**
   * 最近一次寫入失敗的訊息（優先取後端 detail）。給「要把錯誤留在原地而不是彈
   * 一次 toast 就消失」的呼叫端用；`null` 代表「沒有失敗」——包含「因重入守衛
   * 而根本沒送出」的情況，呼叫端不可把 null 當成失敗。
   */
  const lastError = ref<string | null>(null)

  /** 班次名稱／出發時間查表；daily-plans 回應不帶這兩欄。 */
  const routeMeta = ref<Map<number, RouteMeta>>(new Map())

  /** 全園在讀學生，**只留 id/name**（插入 Dialog 用；延後到開啟時才載）。 */
  const students = ref<Array<{ id: number; name: string }>>([])
  const studentsLoading = ref(false)
  /** 學生清單載入失敗：候選是空的，但**不是**「沒有學生可以插入」。 */
  const studentsFailed = ref(false)
  let studentsLoaded = false

  const selectedPlan = computed(
    () => plans.value.find((p) => p.trip.id === selectedTripId.value) ?? null,
  )

  /**
   * 假日警示（spec「行事曆整合」：顯著警示但**不阻擋**發車）。
   * 後端逐班次回同一份 `calendar_warnings`（只依日期計算），取第一筆即可。
   *
   * ⚠ 後端回的是**完整句子**（`services/bus_daily_plan.py::calendar_warnings` 產出
   * 「本日為假日：中秋節」「園所行事曆：校慶補假」），不是純名稱——所以警示條不可
   * 再自己套一層「本日為假日／非上課日（…）」的外框，會變成「本日為假日／非上課日
   * （本日為假日：中秋節）」。`BusDispatchDateBar` 的文案已配合改為直接呈現這串。
   */
  const holidayNotice = computed<{ is_holiday: boolean; label: string } | null>(() => {
    const warnings = plans.value[0]?.calendar_warnings ?? []
    if (warnings.length === 0) return null
    return { is_holiday: true, label: warnings.join('、') }
  })

  /**
   * ETA 可能已過期（spec「eta_planned 雙存語意」）。
   *
   * 後端算式＝`depart_time_planned != route.depart_time or 任一站 excused`，但它只在
   * `GET /daily-plans` 回應裡出現——`DailyPlanStopsPatchOut` 與 `DailyPlanResetOut`
   * 都不帶這個欄位。若直接讀載入當下的快照，管理員標記一位學生今日不搭之後，後端
   * 認定的 stale 已經成立（少一站後平移出來的 eta_planned 就失真了），畫面卻還在
   * 若無其事地顯示那排 ETA——那正是 `src/api/bus.ts` 自己寫的「不可默默顯示可能
   * 失真的 ETA」。
   *
   * 故改為「伺服器快照 OR 本地可觀察到的 excused」：後半段涵蓋本頁能造成的所有變化
   * （標記／取消不搭車、重設），前半段涵蓋 `depart_time_planned` 被改（本頁沒有這個
   * 動作，載入時的值就是最新的）。**刻意不在前端比對兩個時間字串**——route 的
   * `depart_time` 與 trip 的 `depart_time_planned` 格式未必逐字相同（`07:00` vs
   * `07:00:00`），比錯會變成永遠亮著的假警示。
   */
  const etaStale = computed(() => {
    const plan = selectedPlan.value
    if (!plan) return false
    return plan.eta_may_be_stale || plan.stops.some((s) => s.status === 'excused')
  })

  /** 目前選中班次的載客數（departed + pending）。 */
  const departedPending = computed(() => departedPendingCount(selectedPlan.value?.stops ?? []))

  /**
   * 超過座位上限。**不擋任何動作**——銷假還原（`excused/leave → pending`）會讓
   * 人數回升到超額，spec 明定「不自動拒載，站照還原、由管理員處置」，所以這只是
   * 一個顯著警示旗標。真正硬擋的是後端對「主動加人」的 422。
   */
  const overCapacity = computed(() => {
    const plan = selectedPlan.value
    return plan ? departedPending.value > plan.capacity : false
  })

  /**
   * 目前選中的班次可否編輯（spec「daily-plans 寫入端點守衛形狀」的前端鏡像）。
   *
   * 這是 **UI 鎖**不是安全邊界：只負責把按不到的按鈕先 disable 掉，避免使用者
   * 排了半天才吃一個 403。真正的守門在後端 handler。
   */
  function canEdit(plan: DispatchPlan | null): boolean {
    if (!plan) return false
    if (plan.trip.status === 'planned') return hasPermission(PERMISSION_NAMES.BUS_WRITE)
    if (plan.trip.status === 'in_progress') {
      return hasPermission(PERMISSION_NAMES.BUS_IN_PROGRESS_WRITE)
    }
    return false // completed／expired 全面唯讀（後端 409）
  }

  const editable = computed(() => canEdit(selectedPlan.value))
  const inProgress = computed(() => selectedPlan.value?.trip.status === 'in_progress')
  /**
   * 「有這個班次但你沒權限改」——與「班次已結束所以誰都不能改」是兩件事，
   * view 要顯示的鎖定提示文案不同（前者要說「請聯絡管理員授權」）。
   */
  const lockedByPermission = computed(() => {
    const plan = selectedPlan.value
    if (!plan) return false
    const open = plan.trip.status === 'planned' || plan.trip.status === 'in_progress'
    return open && !editable.value
  })

  // ── 載入 ──────────────────────────────────────────────────────────────────

  /**
   * 班次名稱／方向／出發時間。`GET /bus/routes` 同時回全車名冊與家庭座標，
   * 那些一個欄位都不進狀態——本頁的站點資料一律來自 daily-plans。
   */
  async function loadRouteMeta(): Promise<void> {
    const res = await listBusRoutes()
    const next = new Map<number, RouteMeta>()
    for (const route of res.data.routes) {
      next.set(route.id, {
        name: route.name,
        direction: asDirection(route.direction),
        depart_time: route.depart_time,
      })
    }
    routeMeta.value = next
  }

  function toPlans(items: Schema<'DailyPlansOut'>['items']): DispatchPlan[] {
    return items.map((item) => {
      const meta = routeMeta.value.get(item.trip.route_id)
      return {
        trip: item.trip,
        stops: stripCoordinates(item.stops),
        calendar_warnings: item.calendar_warnings,
        capacity: item.capacity.capacity,
        eta_may_be_stale: item.eta_may_be_stale,
        route_name: meta?.name ?? `班次 #${item.trip.route_id}`,
        direction: asDirection(item.trip.direction),
        // 當日可改出發時間；未改時後端已從 route 複製，兩者相同
        depart_time: item.trip.depart_time_planned ?? meta?.depart_time ?? '',
      }
    })
  }

  /**
   * 取（並懶生成）`date` 當天的全部班次計畫。
   *
   * 班次表與計畫用 `allSettled` 分開判定：班次表失敗只讓卡片顯示 `班次 #id`
   * （計畫本身仍可編輯），計畫失敗才是真正的載入失敗。
   */
  async function load(): Promise<void> {
    loading.value = true
    loadFailed.value = false
    const [metaResult, planResult] = await Promise.allSettled([
      loadRouteMeta(),
      getBusDailyPlan({ date: date.value }),
    ])
    if (metaResult.status === 'rejected') {
      ElMessage.warning(apiError(metaResult.reason, '班次名稱載入失敗，卡片將以編號顯示'))
    }
    if (planResult.status === 'rejected') {
      loadFailed.value = true
      plans.value = []
      selectedTripId.value = null
      ElMessage.error(apiError(planResult.reason, '載入當日計畫失敗，請重新整理'))
      loading.value = false
      return
    }
    plans.value = toPlans(planResult.value.data.items)
    // 換日後舊 trip_id 不存在了；沒有選中的就落在第一張卡
    if (!plans.value.some((p) => p.trip.id === selectedTripId.value)) {
      selectedTripId.value = plans.value[0]?.trip.id ?? null
    }
    loading.value = false
  }

  /**
   * 換日期並重載。超出今天~+7 直接擋下（後端會 422；先擋是為了不讓那次
   * **有寫入副作用的 GET** 白跑一趟，也不讓畫面短暫清空）。
   */
  async function setDate(next: string): Promise<boolean> {
    const today = todayTaipeiISO()
    if (next < today || next > isoPlusDays(today, MAX_DAYS_AHEAD)) {
      ElMessage.error(`只能調度今天起 ${MAX_DAYS_AHEAD} 天內的班次`)
      return false
    }
    if (next === date.value) return true
    date.value = next
    optimizePreviewData.value = null
    optimizeError.value = null
    await load()
    return true
  }

  function selectTrip(tripId: number): void {
    if (tripId === selectedTripId.value) return
    selectedTripId.value = tripId
    optimizePreviewData.value = null
    optimizeError.value = null
  }

  // ── 臨時插入的候選學生 ─────────────────────────────────────────────────────

  /**
   * 在讀學生清單（翻頁到底）。只留 `id`/`name`——回應還帶家長姓名／電話／住址，
   * 那些一個欄位都不需要進前端狀態（比照 `useBusRouteEditor.loadStudents`）。
   *
   * **延後載入**：全園名冊只有按下「插入學生」才需要，進頁就撈等於每個看調度頁的
   * 人都把整份學生名冊拉進瀏覽器。載過一次就不再重載（同一次進頁內名冊不會變）。
   */
  async function loadStudents(): Promise<void> {
    if (studentsLoaded || studentsLoading.value) return
    studentsLoading.value = true
    studentsFailed.value = false
    const collected: Array<{ id: number; name: string }> = []
    try {
      let skip = 0
      for (let page = 0; page < MAX_STUDENT_PAGES; page += 1) {
        const res = await getStudents({ limit: STUDENT_PAGE_SIZE, skip, is_active: true })
        const items = res.data.items ?? []
        for (const item of items) {
          // 缺名的學生若原樣放進下拉，會是一個「點得下去、送得出去」的空白選項。
          // 與 `useBusRouteEditor.loadStudents` 同一條退化規則。
          collected.push({ id: item.id, name: item.name || `學生 #${item.id}` })
        }
        const total = res.data.total ?? collected.length
        skip += items.length
        if (items.length === 0 || collected.length >= total) break
      }
      students.value = collected
      studentsLoaded = true
    } catch (e) {
      studentsFailed.value = true
      ElMessage.error(apiError(e, '載入學生名單失敗，暫時無法插入學生'))
    } finally {
      studentsLoading.value = false
    }
  }

  /**
   * 可插入目前這條班次的學生＝排掉「後端一定會 422」的兩種人：
   *
   * 1. 已在**本班次**當日名單上的（任何狀態，含 excused——後端擋的是
   *    `學生 X 已在當日名單中`，excused 的人要用「取消不搭車」而不是重新插入）。
   * 2. 同日、**同方向**的其他班次上有非 excused 站的（後端
   *    `_daily_cross_trip_conflict`：整批 422）。反方向不衝突——早上 A 線接、
   *    下午 B 線送是正常排法。
   *
   * ⚠ **已知不完備（刻意不補）**：`GET /bus/daily-plans` 只回未完成的 trip
   * （planned／in_progress），但後端的衝突檢查會查同日**所有**其他 trip、
   * 不過濾 `status`。所以「早班已 completed → 同日又開第二趟」的情境下，
   * 本清單會列出實際上會被 422 的學生。為此多打一支查歷史 trip 的 API 不划算：
   * 情境低頻，而且後端 422 的訊息會指名是哪一條班次撞了，Dialog 也保留表單
   * 讓使用者直接改選——失效方向安全（多列，不是少列）。
   */
  const insertCandidates = computed(() => {
    const plan = selectedPlan.value
    if (!plan) return []
    const blocked = new Set<number>(plan.stops.map((s) => s.student_id))
    for (const other of plans.value) {
      if (other.trip.id === plan.trip.id) continue
      if (other.direction !== plan.direction) continue
      for (const s of other.stops) {
        if (s.status !== 'excused') blocked.add(s.student_id)
      }
    }
    return students.value.filter((s) => !blocked.has(s.id))
  })

  // ── 編輯（每個動作立即送出，以回應為權威）──────────────────────────────

  /**
   * 送出一次 `PATCH …/stops` 並以回應重填該班次。
   *
   * 只重填**這一條**班次：其他班次的當日計畫沒有變，整批重載會多打一次懶生成
   * GET（有寫入副作用），也會讓畫面閃一下。
   *
   * `silent` 給「呼叫端自己要把錯誤顯示在原地」的流程用（例如插入 Dialog 要把
   * 422 留在表單上），避免同一則訊息既彈 toast 又印在 Dialog 裡。
   */
  async function patchStops(
    payload: PatchPayload,
    failMessage: string,
    { silent = false }: { silent?: boolean } = {},
  ): Promise<boolean> {
    const plan = selectedPlan.value
    // 重入守衛：**不碰 `lastError`**——這裡是「根本沒送出」，不是失敗。若清成
    // 某個字串，呼叫端會顯示一個不存在的錯誤（雙擊送出鈕就會看到）。
    if (!plan || saving.value || optimizing.value) return false
    saving.value = true
    lastError.value = null
    try {
      const res = await patchBusDailyPlanStops(plan.trip.id, payload)
      plans.value = plans.value.map((p) => (
        p.trip.id === plan.trip.id
          ? {
            ...p,
            trip: res.data.trip,
            stops: stripCoordinates(res.data.stops),
            capacity: res.data.capacity.capacity,
          }
          : p
      ))
      return true
    } catch (e) {
      // 失敗不動本地狀態：後端整批 422（跨班次重複、超 capacity、狀態不符）時
      // 什麼都沒落庫，把畫面改掉反而是說謊。
      //
      // 後端這幾則 422 的 detail 是**可行動**的（「學生 X 今日已排入其他班次
      // 『B 線』」「人數 21 超過座位上限 20」「學生 X 缺少接送座標，請先定位」）
      // ——每一句都直接告訴使用者下一步要去哪裡改，吞成通用文案等於把它丟掉。
      // ⚠ `apiError` 不處理 FastAPI Pydantic validator 吐的陣列形狀 detail
      // （`[{loc,msg,type}]`，見 `src/utils/error.ts` 檔頭），那種會退回 failMessage。
      // 本檔送出的 payload 一律至少含一項操作，不會觸發那條 model_validator。
      const message = apiError(e, failMessage)
      lastError.value = message
      if (!silent) ElMessage.error(message)
      return false
    } finally {
      saving.value = false
    }
  }

  /** 名單外學生臨時插入（spec「planned 階段編輯」第 3 點）。 */
  function insertStop(insert: Schema<'DailyPlanStopInsertIn'>): Promise<boolean> {
    // silent：422 要留在 Dialog 上讓使用者照著改，不是彈一次就消失的 toast
    return patchStops({ inserts: [insert] }, '插入學生失敗', { silent: true })
  }

  /** 後台標記今日不搭（`excused/admin`）。只有 pending 站可標，後端 422 擋其餘。 */
  function markExcusedAdmin(studentId: number): Promise<boolean> {
    return patchStops({ excuse: [studentId] }, '標記不搭車失敗')
  }

  /**
   * 取消 excused 回 pending。
   *
   * spec「in_progress 的 excused 救援」：車到現場發現學生在場（家長誤按、假單
   * 登錯）時，司機端**不提供**恢復操作，唯一救援路徑就是這裡——所以 in_progress
   * 下對 `leave`／`parent` 也開放；planned 下後端只允許取消 `admin` 標記的
   * （請假與家長取消是別處的事實，要從假單／家長端撤銷）。
   */
  function unmarkExcused(studentId: number): Promise<boolean> {
    return patchStops({ unexcuse: [studentId] }, '取消不搭車失敗')
  }

  /** 當日改接送地址。in_progress 不可用（後端 422），view 先 disable。 */
  function changeAddress(change: Schema<'DailyPlanAddressChangeIn'>): Promise<boolean> {
    return patchStops({ address_changes: [change] }, '變更接送地址失敗')
  }

  /** 移除當日站點。in_progress 不可用（後端 422），view 先 disable。 */
  function removeStop(studentId: number): Promise<boolean> {
    return patchStops({ removes: [studentId] }, '移除站點失敗')
  }

  /**
   * 拖拉重排（spec「呼叫時機與節流」：拖拉後該站自動 pinned、順序固定重算 ETA，
   * 由後端在 PATCH 內完成——前端**絕不**在拖拉當下呼叫最佳化 API）。
   *
   * 後端要求 `reorder` 恰好等於目前 pending 站的完整清單（少一個就整批 422），
   * 因此這裡送的是重排後的**全部 pending student_id**，不是被移動的那一個。
   */
  function moveStop(fromIndex: number, toIndex: number): Promise<boolean> {
    const pending = (selectedPlan.value?.stops ?? []).filter((s) => s.status === 'pending')
    if (
      fromIndex < 0 || fromIndex >= pending.length
      || toIndex < 0 || toIndex >= pending.length
      || fromIndex === toIndex
    ) {
      return Promise.resolve(false)
    }
    const next = [...pending]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    return patchStops({ reorder: next.map((s) => s.student_id) }, '調整順序失敗')
  }

  // ── 自動排序（預覽 → 套用）───────────────────────────────────────────────

  /**
   * 取得建議順序預覽（`apply: false`，不落庫）。
   * Azure 失敗時後端回 502，此時**不落任何變更**——錯誤留在 `optimizeError`
   * 由 Dialog 顯示重試，不可假裝排序成功。
   */
  async function optimizePreview(): Promise<void> {
    const plan = selectedPlan.value
    if (!plan || optimizing.value) return
    optimizing.value = true
    optimizeError.value = null
    optimizePreviewData.value = null
    try {
      const res = await optimizeBusDailyPlan(plan.trip.id, { apply: false })
      optimizePreviewData.value = res.data
    } catch (e) {
      optimizeError.value = apiError(e, '路徑最佳化服務暫時無法使用，請稍後重試')
    } finally {
      optimizing.value = false
    }
  }

  /** 套用建議順序（`apply: true`）並重載該班次。 */
  async function applyOptimize(): Promise<boolean> {
    const plan = selectedPlan.value
    if (!plan || optimizing.value) return false
    optimizing.value = true
    try {
      await optimizeBusDailyPlan(plan.trip.id, { apply: true })
    } catch (e) {
      optimizeError.value = apiError(e, '套用建議順序失敗，請稍後重試')
      optimizing.value = false
      return false
    }
    optimizing.value = false
    optimizePreviewData.value = null
    // optimize 只回順序與 ETA，站點狀態仍以 daily-plans 為權威——重載一次比自行
    // 拼裝可靠（且此時該班次已有未完成 trip，GET 不會再生成新的）。
    await load()
    ElMessage.success('已套用建議順序')
    return true
  }

  function cancelOptimize(): void {
    optimizePreviewData.value = null
    optimizeError.value = null
  }

  // ── 重設為預設名單 ─────────────────────────────────────────────────────────

  /**
   * 重設（spec 生命週期第 6 點）。**二次確認由 view 負責**——planned 與
   * in_progress 的破壞範圍不同（後者會保留已 departed 的站、丟棄後台排除與
   * 臨時插入），文案要講明是哪一種，那是呈現層的判斷。
   */
  async function resetPlan(): Promise<boolean> {
    const plan = selectedPlan.value
    if (!plan || saving.value || optimizing.value) return false
    saving.value = true
    lastError.value = null
    try {
      const res = await resetBusDailyPlan(plan.trip.id)
      // `DailyPlanResetOut` 只有 trip + stops（沒有 capacity）——載客數與超載警示
      // 因此一律由 `departedPendingCount(stops)` 現算，不存欄位（見該函式註解）。
      plans.value = plans.value.map((p) => (
        p.trip.id === plan.trip.id
          ? { ...p, trip: res.data.trip, stops: stripCoordinates(res.data.stops) }
          : p
      ))
      ElMessage.success('已重設為預設名單')
      return true
    } catch (e) {
      const message = apiError(e, '重設失敗，請稍後再試')
      lastError.value = message
      ElMessage.error(message)
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    date, plans, selectedPlan, selectedTripId, loading, saving, loadFailed,
    holidayNotice, etaStale, overCapacity, editable, inProgress, lockedByPermission,
    optimizePreviewData, optimizing, optimizeError, lastError, departedPending,
    students, studentsLoading, studentsFailed, insertCandidates, loadStudents,
    load, setDate, selectTrip, canEdit,
    insertStop, markExcusedAdmin, unmarkExcused, changeAddress, removeStop, moveStop,
    optimizePreview, applyOptimize, cancelOptimize, resetPlan,
  }
}
