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
import type { ApiBody, Schema } from '@/api/_generated/typed'
import type { BusDirection } from '@/composables/useBusRouteEditor'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { dateToLocalISO, parseLocalISODate, todayISO } from '@/utils/format'

/** 與後端 `api/bus/daily_plans.py::MAX_DAYS_AHEAD` 對齊（今天~+7，超界 422）。 */
export const MAX_DAYS_AHEAD = 7

/** 後端 `BusStopAdminOut` 原樣（禁止手抄；codegen 是契約唯一事實來源）。 */
export type DispatchStop = Schema<'BusStopAdminOut'>

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
  /** `departed + pending`（後端算好的載客數；excused／skipped 不計）。 */
  departed_pending: number
  eta_may_be_stale: boolean
  route_name: string
  direction: BusDirection
  depart_time: string
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
  const date = ref<string>(todayISO())
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

  /** 班次名稱／出發時間查表；daily-plans 回應不帶這兩欄。 */
  const routeMeta = ref<Map<number, RouteMeta>>(new Map())

  const selectedPlan = computed(
    () => plans.value.find((p) => p.trip.id === selectedTripId.value) ?? null,
  )

  /**
   * 假日警示（spec「行事曆整合」：顯著警示但**不阻擋**發車）。
   * 後端逐班次回同一份 `calendar_warnings`（只依日期計算），取第一筆即可。
   */
  const holidayNotice = computed<{ is_holiday: boolean; label: string } | null>(() => {
    const warnings = plans.value[0]?.calendar_warnings ?? []
    if (warnings.length === 0) return null
    return { is_holiday: true, label: warnings.join('、') }
  })

  const etaStale = computed(() => selectedPlan.value?.eta_may_be_stale ?? false)
  /**
   * 超過座位上限。**不擋任何動作**——銷假還原（`excused/leave → pending`）會讓
   * 人數回升到超額，spec 明定「不自動拒載，站照還原、由管理員處置」，所以這只是
   * 一個顯著警示旗標。真正硬擋的是後端對「主動加人」的 422。
   */
  const overCapacity = computed(() => {
    const plan = selectedPlan.value
    return plan ? plan.departed_pending > plan.capacity : false
  })

  /**
   * 目前選中的班次可否編輯（spec「daily-plans 寫入端點守衛形狀」的前端鏡像）。
   *
   * 這是 **UI 鎖**不是安全邊界：只負責把按不到的按鈕先 disable 掉，避免使用者
   * 排了半天才吃一個 403。真正的守門在後端 handler。
   */
  function canEdit(plan: DispatchPlan | null): boolean {
    if (!plan) return false
    if (plan.trip.status === 'planned') return hasPermission('BUS_WRITE')
    if (plan.trip.status === 'in_progress') return hasPermission('BUS_IN_PROGRESS_WRITE')
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
        stops: item.stops,
        calendar_warnings: item.calendar_warnings,
        capacity: item.capacity.capacity,
        departed_pending: item.capacity.departed_pending,
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
    const today = todayISO()
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

  // ── 編輯（每個動作立即送出，以回應為權威）──────────────────────────────

  /**
   * 送出一次 `PATCH …/stops` 並以回應重填該班次。
   *
   * 只重填**這一條**班次：其他班次的當日計畫沒有變，整批重載會多打一次懶生成
   * GET（有寫入副作用），也會讓畫面閃一下。
   */
  async function patchStops(payload: PatchPayload, failMessage: string): Promise<boolean> {
    const plan = selectedPlan.value
    if (!plan || saving.value) return false
    saving.value = true
    try {
      const res = await patchBusDailyPlanStops(plan.trip.id, payload)
      plans.value = plans.value.map((p) => (
        p.trip.id === plan.trip.id
          ? {
            ...p,
            trip: res.data.trip,
            stops: res.data.stops,
            capacity: res.data.capacity.capacity,
            departed_pending: res.data.capacity.departed_pending,
          }
          : p
      ))
      return true
    } catch (e) {
      // 失敗不動本地狀態：後端整批 422（跨班次重複、超 capacity、狀態不符）時
      // 什麼都沒落庫，把畫面改掉反而是說謊。
      ElMessage.error(apiError(e, failMessage))
      return false
    } finally {
      saving.value = false
    }
  }

  /** 名單外學生臨時插入（spec「planned 階段編輯」第 3 點）。 */
  function insertStop(insert: Schema<'DailyPlanStopInsertIn'>): Promise<boolean> {
    return patchStops({ inserts: [insert] }, '插入學生失敗')
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
    if (!plan || saving.value) return false
    saving.value = true
    try {
      const res = await resetBusDailyPlan(plan.trip.id)
      plans.value = plans.value.map((p) => (
        p.trip.id === plan.trip.id ? { ...p, trip: res.data.trip, stops: res.data.stops } : p
      ))
      ElMessage.success('已重設為預設名單')
      return true
    } catch (e) {
      ElMessage.error(apiError(e, '重設失敗，請稍後再試'))
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    date, plans, selectedPlan, selectedTripId, loading, saving, loadFailed,
    holidayNotice, etaStale, overCapacity, editable, inProgress, lockedByPermission,
    optimizePreviewData, optimizing, optimizeError,
    load, setDate, selectTrip, canEdit,
    insertStop, markExcusedAdmin, unmarkExcused, changeAddress, removeStop, moveStop,
    optimizePreview, applyOptimize, cancelOptimize, resetPlan,
  }
}
