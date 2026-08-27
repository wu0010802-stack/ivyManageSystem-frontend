/**
 * 管理端娃娃車**班次**編輯（`/bus/routes` 專用，非 module singleton）。
 *
 * 後端 `PUT /api/bus/routes/{id}/stops` 是**整條班次 replace-all**：送出的清單就是
 * 該班次的全部站點，沒送的一律刪除。本檔因此持有一份「編輯緩衝」（`stops`），
 * 與伺服器上的名冊（`routes[].stops`）分開，只有按下儲存才同步。
 *
 * ── 本期契約破壞（spec「第一期契約破壞清單」）─────────────────────────────────
 *
 * 1. **班次改單方向**：`direction` 從「頁面的一個 tab」變成 route 自己的欄位，
 *    migration 已把雙向路線拆成兩筆班次。因此 `direction` ref 與 `setDirection`
 *    整組移除，`BusRouteRow.stops` 從 `Record<direction, …>` 塌平成單一清單。
 * 2. **replace-all 範圍**從「路線×方向」變成「整條班次」。
 * 3. `stops[]` 擴 `ride_days`（bitmask）／`pinned`／`pickup_address_id`／`eta_planned`。
 *
 * ── 依 repo 實況保留的既有決策 ─────────────────────────────────────────────────
 *
 * 1. **不自動建立班次**：後端沒有刪除班次的端點，誤建的刪不掉（只能停用）。
 * 2. **未儲存的編輯不得靜默丟棄**：切換班次、改班次設定、重讀清單前一律先確認。
 * 3. **站數上限與後端對齊**（`MAX_STOPS_PER_ROUTE = 60`），否則是整批 422。
 * 4. **候選名單要排掉「後端一定會拒絕」的學生**——但判準已改（見下方 `rideDaysOverlap`）。
 * 5. **學生清單要翻頁**：`GET /api/students` 的 `limit` 上限 500。
 *
 * ── 跨班次重複規則（取代第一期「同方向就擋」）───────────────────────────────
 * 同學生「**同方向且 `ride_days` 有交集**」才不得存在於兩個班次。
 * 「週一~三住家搭早 A、週四五阿嬤家搭早 B」是本期多地址功能的**正當場景**，
 * 因此候選名單只排掉「其他同方向班次已把週一~五佔滿」的學生；還有空檔的學生
 * 仍可加入，新站點的 `ride_days` 預設只帶剩餘的空檔（見 `addStop`）。
 *
 * ── 隱私 ────────────────────────────────────────────────────────────────────
 * `GET /api/students` 回傳含家長姓名／電話／住址；本檔只留 `id`/`name` 進狀態。
 * 站點的座標與接送地址是本頁需要的欄位（spec 已把第一期「只留 id/name」的限縮
 * 放寬為「保留本頁需要的欄位」），但一律**不進** console／Sentry／URL query／
 * localStorage／sessionStorage；座標數字也不渲染成表格欄位（只供最佳化、ETA
 * 與地圖微調起始位置使用）。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  copyBusRouteFrom, createBusRoute, listBusRoutes, optimizeBusRoute,
  recomputeBusRouteEtas, reorderBusRoutes, replaceBusRouteStops, updateBusRoute,
} from '@/api/bus'
import { getStudents } from '@/api/students'
import { apiError } from '@/utils/error'

/** 與後端 `api/bus/admin_routes.py::MAX_STOPS_PER_ROUTE` 對齊。 */
export const MAX_STOPS_PER_ROUTE = 60
/** `GET /api/students` 的 `limit` 上限（後端 `Query(50, ge=1, le=500)`）。 */
export const STUDENT_PAGE_SIZE = 500
/** 翻頁保險絲：後端 total 異常時不至於變成無窮迴圈。 */
const MAX_STUDENT_PAGES = 20

export type BusDirection = 'morning' | 'afternoon'

export const DIRECTION_LABELS: Record<BusDirection, string> = {
  morning: '早上接學生',
  afternoon: '下午送學生',
}

// ── ride_days bitmask（bit0=週一 … bit6=週日；本期 UI 只出週一~五）────────────

/** 週一~五的顯示標籤，index 對應 bit0~bit4。 */
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五'] as const
/** 週一~五全選＝`0b11111`＝31，與後端 `StopIn.ride_days` 的 default 一致。 */
export const FULL_WEEK_RIDE_DAYS = 0b11111
/** 新站點預設搭乘日（週一~五）。 */
export const DEFAULT_RIDE_DAYS = FULL_WEEK_RIDE_DAYS

/** 兩個 bitmask 是否有交集——跨班次重複規則的唯一判準。 */
export function rideDaysOverlap(a: number, b: number): boolean {
  return (a & b) !== 0
}

/** bitmask → 勾選的星期 index 清單（0＝週一 … 4＝週五），供 checkbox group 綁定。 */
export function rideDaysToWeekdays(mask: number): number[] {
  const days: number[] = []
  for (let i = 0; i < WEEKDAY_LABELS.length; i += 1) {
    if (mask & (1 << i)) days.push(i)
  }
  return days
}

/** 勾選的星期 index 清單 → bitmask。 */
export function weekdaysToRideDays(days: readonly number[]): number {
  return days.reduce((mask, d) => (d >= 0 && d < WEEKDAY_LABELS.length ? mask | (1 << d) : mask), 0)
}

export interface BusStopContact {
  name: string
  phone: string | null
}

export interface BusStopDraft {
  student_id: number
  student_name: string
  /**
   * 學生班級名。
   *
   * ⚠ 與 `contacts` 同一個缺口：後端 `BusRouteStopOut` 目前不回這個欄位
   * （spec 名單表格列了「學生＋班級」）。缺值時為 null，表格只顯示姓名，
   * 後端補上同名欄位後自動帶入。
   */
  classroom_name: string | null
  seq: number
  lat: number | null
  lng: number | null
  /**
   * 所選接送地址的文字快照（住家地址或地址簿該筆）。表格顯示這個欄位，
   * **不顯示經緯度數字**（spec 隱私規範＋FE-ROUTES-04 決策）。
   */
  address_snapshot: string | null
  /**
   * 存檔時的地址快照與所選地址來源的現值不一致（學生搬家／地址簿被改過）。
   * 後端快照為 NULL（舊資料未補）一律當 false，不誤報成「已過期」。
   */
  address_stale: boolean
  /** bitmask，bit0=週一 … bit4=週五。 */
  ride_days: number
  /** 釘選：最佳化時固定此站順位；拖拉調整過的站自動為 true。 */
  pinned: boolean
  /** NULL＝用學生**住家**地址（不是「無地址」）。 */
  pickup_address_id: number | null
  /** 最佳化結果的預計抵達（顯示用快取，`HH:MM:SS`）。 */
  eta_planned: string | null
  /**
   * 監護人聯絡資訊（`is_primary`＋`is_emergency`，fallback 由後端算好）。
   *
   * ⚠ 後端 `GET /api/bus/routes` 的 `BusRouteStopOut` **目前不回這個欄位**
   * （spec「前端（admin）模組拆分」列了聯絡人欄，但 admin_routes.py 的 schema
   * 未實作）。這裡保留欄位並在缺值時給空陣列，讓表格顯示「—」而不是假資料；
   * 後端補上同名欄位後本檔的 normalize 會自動帶入，不需再改。
   */
  contacts: BusStopContact[]
}

export interface BusRouteOperator {
  employee_id: number
  name: string
}

export interface BusRouteRow {
  id: number
  name: string
  is_active: boolean
  /** 建立後唯讀——migration 已依方向拆分班次，既有班次不可換向。 */
  direction: BusDirection
  /** `HH:MM:SS`。 */
  depart_time: string
  /** 最佳化演算法算出的預計結束時間，尚未算過為 null。 */
  end_time_planned: string | null
  sort_order: number
  capacity: number
  operators: BusRouteOperator[]
  stops: BusStopDraft[]
}

/** 自動排序／重算 ETA 的預覽結果（不落庫，套用後仍需儲存）。 */
export interface RouteOptimizePreview {
  applied: boolean
  end_time_planned: string | null
  moved_unpinned_student_ids: number[]
  stops: Array<{ student_id: number; seq: number; eta_planned: string | null }>
}

/** 「帶入其他班次名單」預覽中，與現有班次衝突的學生。 */
export interface CopyFromConflict {
  student_id: number
  student_name: string
  conflict_route_name: string | null
}

// ── 型別 narrow（禁 any）──
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function asBool(v: unknown): boolean {
  return v === true
}
function asDirection(v: unknown): BusDirection {
  return v === 'afternoon' ? 'afternoon' : 'morning'
}
/** HTTP status，用來在 apiError 的通用 fallback 之外對 409 給更明確的訊息。 */
function errorStatus(e: unknown): number | null {
  const r = asRecord((e as { response?: unknown } | null)?.response)
  return r ? asNum(r.status) : null
}
function dataOf(res: unknown): Record<string, unknown> {
  return asRecord((res as { data?: unknown }).data) ?? {}
}

function normalizeContacts(raw: unknown): BusStopContact[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const r = asRecord(item)
    const name = r ? asStr(r.name) : null
    if (name === null) return []
    return [{ name, phone: r ? asStr(r.phone) : null }]
  })
}

function normalizeStops(raw: unknown): BusStopDraft[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const r = asRecord(item)
    const studentId = r ? asNum(r.student_id) : null
    if (r === null || studentId === null) return []
    return [{
      student_id: studentId,
      student_name: asStr(r.student_name) ?? '',
      classroom_name: asStr(r.classroom_name),
      seq: asNum(r.seq) ?? 0,
      lat: asNum(r.lat),
      lng: asNum(r.lng),
      address_snapshot: asStr(r.address_snapshot),
      address_stale: asBool(r.address_stale),
      ride_days: asNum(r.ride_days) ?? DEFAULT_RIDE_DAYS,
      pinned: asBool(r.pinned),
      pickup_address_id: asNum(r.pickup_address_id),
      eta_planned: asStr(r.eta_planned),
      contacts: normalizeContacts(r.contacts),
    }]
  })
}

function normalizeOperators(raw: unknown): BusRouteOperator[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const r = asRecord(item)
    const employeeId = r ? asNum(r.employee_id) : null
    if (r === null || employeeId === null) return []
    return [{ employee_id: employeeId, name: asStr(r.name) ?? `員工 #${employeeId}` }]
  })
}

/** 重新編號成 1..n；`seq` 重複時排序會失去決定性。 */
function renumber(list: BusStopDraft[]): BusStopDraft[] {
  return list.map((s, i) => ({ ...s, seq: i + 1 }))
}

export function useBusRouteEditor() {
  const routes = ref<BusRouteRow[]>([])
  const activeRouteId = ref<number | null>(null)
  /** 編輯緩衝；與伺服器名冊分離，按下儲存才同步。 */
  const stops = ref<BusStopDraft[]>([])
  /** 全園在讀學生，只留 id/name。 */
  const students = ref<Array<{ id: number; name: string }>>([])
  const loading = ref(true)
  const saving = ref(false)
  const creating = ref(false)
  /** 班次設定（PATCH）的 in-flight 旗標，與 saving/creating 同層級。 */
  const updatingRoute = ref(false)
  /** 班次排序（PATCH /routes/reorder）的 in-flight 旗標。 */
  const reordering = ref(false)
  /**
   * 自動排序預覽的 in-flight 旗標。與 `recomputingEtas` 分開：兩顆按鈕各轉各的
   * loading，使用者才分得清是哪個動作在跑；但兩支端點都對伺服器名單運算，
   * 仍互斥（見各自開頭的 guard）。
   */
  const optimizing = ref(false)
  /** 順序固定重算 ETA 的 in-flight 旗標。 */
  const recomputingEtas = ref(false)
  /** 「帶入其他班次名單」的 in-flight 旗標。 */
  const copying = ref(false)
  /** 班次清單載入失敗：`routes` 是空的，但**不是**「園裡沒有班次」。 */
  const loadFailed = ref(false)
  /** 學生清單載入失敗：候選名單是空的，但**不是**「沒有學生可以加」。 */
  const studentsFailed = ref(false)
  /** 編輯緩衝與伺服器名冊已分岔；切換班次與離開頁面前要提醒。 */
  const dirty = ref(false)
  /**
   * 本 composable 之外的「未儲存」來源（目前是班次設定表單的欄位編輯）。
   *
   * `dirty` 只追蹤 `stops`。表單（BusRouteForm）刻意只在 route **id 變更**時
   * 重置欄位，同 id 的 `loadRoutes()` 重讀不會動它——因此會蓋掉表單編輯的只有
   * 「切換班次／建立班次」（id 會變）與離頁，那幾條路徑要看 `anyDirty`；
   * 同 id 的重讀（改設定、reorder、儲存名單）只需要守 `stops`（見
   * `confirmDiscard` 的 scope 參數）。
   */
  const extraDirtySources = ref<Array<() => boolean>>([])
  function registerExtraDirty(fn: () => boolean): void {
    extraDirtySources.value = [...extraDirtySources.value, fn]
  }
  /** 任何一個來源有未儲存變更即為 true。供 view 的離頁／關分頁保護使用。 */
  const anyDirty = computed(() => dirty.value || extraDirtySources.value.some((fn) => fn()))
  /** 最近一次「帶入其他班次名單」預覽標示出的衝突學生（供 view 呈現）。 */
  const copyConflicts = ref<CopyFromConflict[]>([])
  /**
   * 最近一次自動排序**失敗**的訊息（Azure 不可用時後端回 502）。
   * 與「被 dirty 前置擋下」區分開來：那不是錯誤，不該開一個帶重試鈕的錯誤對話框。
   */
  const optimizeErrorMessage = ref<string | null>(null)

  const activeRoute = computed(() => routes.value.find((r) => r.id === activeRouteId.value) ?? null)
  /** 伺服器上目前這條班次的名冊（用來判斷「儲存會不會清空」）。 */
  const savedStops = computed(() => activeRoute.value?.stops ?? [])
  const capacity = computed(() => activeRoute.value?.capacity ?? 0)

  /**
   * 其他**同方向**班次已佔用的 ride_days（per student）。
   * 送出時只要與這裡有交集就會整批 422（後端 `_reject_cross_route_duplicates`）。
   */
  const assignedElsewhere = computed(() => {
    const map = new Map<number, { mask: number; routeNames: string[] }>()
    const dir = activeRoute.value?.direction
    if (!dir) return map
    for (const route of routes.value) {
      if (route.id === activeRouteId.value || route.direction !== dir) continue
      for (const stop of route.stops) {
        const prev = map.get(stop.student_id)
        if (prev) {
          prev.mask |= stop.ride_days
          if (!prev.routeNames.includes(route.name)) prev.routeNames.push(route.name)
        } else {
          map.set(stop.student_id, { mask: stop.ride_days, routeNames: [route.name] })
        }
      }
    }
    return map
  })

  /** 某學生在本班次還能搭的星期（bitmask）；0＝週一~五都被其他同方向班次佔滿。 */
  function freeRideDaysFor(studentId: number): number {
    const taken = assignedElsewhere.value.get(studentId)?.mask ?? 0
    return FULL_WEEK_RIDE_DAYS & ~taken
  }

  /**
   * 候選名單：排掉已在本班次的學生，以及「其他同方向班次已把週一~五佔滿」的學生。
   * **沒有**一律排掉所有已排班的學生——ride_days 無交集是本期的正當場景。
   */
  const candidates = computed(() => {
    const picked = new Set(stops.value.map((s) => s.student_id))
    return students.value.filter((s) => !picked.has(s.id) && freeRideDaysFor(s.id) !== 0)
  })

  const missingCoordinateCount = computed(
    () => stops.value.filter((s) => s.lat == null || s.lng == null).length,
  )
  const staleAddressCount = computed(() => stops.value.filter((s) => s.address_stale).length)

  /**
   * 逐星期（一~五）各自的載客數。後端 capacity 檢查是**逐星期取 max ≤ capacity**，
   * 不是總站數——30 人分散在不同星期、任一天 ≤20 是 ride_days 的正當用途。
   */
  const weekdayLoads = computed(() =>
    WEEKDAY_LABELS.map((_, i) => stops.value.filter((s) => s.ride_days & (1 << i)).length),
  )
  const maxWeekdayLoad = computed(() => Math.max(0, ...weekdayLoads.value))
  /** 超過 capacity 的星期 index 清單（0＝週一）；非空即代表儲存會被 422 擋下。 */
  const overloadedWeekdays = computed(() => {
    const cap = capacity.value
    if (cap <= 0) return []
    return weekdayLoads.value.flatMap((load, i) => (load > cap ? [i] : []))
  })

  function resetEditing(): void {
    stops.value = savedStops.value.map((s) => ({ ...s }))
    copyConflicts.value = []
    dirty.value = false
  }

  // ── 載入 ──────────────────────────────────────────────────────────────────

  /** 班次與名冊。**不自動建立班次**——後端沒有刪除端點，誤建的刪不掉。 */
  async function loadRoutes(): Promise<void> {
    const res = await listBusRoutes()
    const data = dataOf(res)
    const raw = Array.isArray(data.routes) ? data.routes : []
    routes.value = raw.flatMap((item) => {
      const r = asRecord(item)
      const id = r ? asNum(r.id) : null
      if (r === null || id === null) return []
      return [{
        id,
        name: asStr(r.name) ?? `班次 #${id}`,
        is_active: r.is_active !== false,
        direction: asDirection(r.direction),
        depart_time: asStr(r.depart_time) ?? '',
        end_time_planned: asStr(r.end_time_planned),
        sort_order: asNum(r.sort_order) ?? 0,
        capacity: asNum(r.capacity) ?? 0,
        operators: normalizeOperators(r.operators),
        stops: normalizeStops(r.stops),
      }]
    })
    if (!routes.value.some((r) => r.id === activeRouteId.value)) {
      activeRouteId.value = routes.value[0]?.id ?? null
    }
    resetEditing()
  }

  /**
   * 在讀學生清單（翻頁到底）。只留 id/name——回應還帶家長姓名／電話／住址，
   * 那些一個欄位都不需要進前端狀態。
   */
  async function loadStudents(): Promise<void> {
    const collected: Array<{ id: number; name: string }> = []
    let skip = 0
    for (let page = 0; page < MAX_STUDENT_PAGES; page += 1) {
      const res = await getStudents({ limit: STUDENT_PAGE_SIZE, skip, is_active: true })
      const data = dataOf(res)
      const items = Array.isArray(data.items) ? data.items : []
      for (const item of items) {
        const r = asRecord(item)
        const id = r ? asNum(r.id) : null
        if (r === null || id === null) continue
        collected.push({ id, name: asStr(r.name) ?? `學生 #${id}` })
      }
      const total = asNum(data.total) ?? collected.length
      skip += items.length
      if (items.length === 0 || collected.length >= total) break
    }
    students.value = collected
  }

  /**
   * 進頁載入。**班次與學生分開判定成敗**：
   *
   * 1. 班次載入失敗時 `routes` 會停在初始 `[]`，畫面若照樣渲染「尚未建立任何班次 +
   *    建立第一個班次」，一次 403／500／斷網就會誘導管理者建出一條**後端沒有端點可以
   *    刪除**的重複班次。因此獨立一個 `loadFailed`，由 view 以錯誤卡取代空狀態並停用
   *    建立按鈕（畫面不得把「連不上」講成「沒有」）。
   * 2. 學生清單失敗只讓候選名單變空；空的候選選單看起來也像「沒有學生可以加」，
   *    故另立 `studentsFailed` 讓 UI 明說。
   */
  async function init(): Promise<void> {
    loading.value = true
    loadFailed.value = false
    studentsFailed.value = false
    const [routesResult, studentsResult] = await Promise.allSettled([loadRoutes(), loadStudents()])
    if (routesResult.status === 'rejected') {
      loadFailed.value = true
      ElMessage.error(apiError(routesResult.reason, '載入娃娃車班次失敗，請重新整理'))
    }
    if (studentsResult.status === 'rejected') {
      studentsFailed.value = true
      ElMessage.error(apiError(studentsResult.reason, '載入學生名單失敗，暫時無法加入新站點'))
    }
    loading.value = false
  }

  // ── 切換（未儲存的編輯要先確認）─────────────────────────────────────────────

  /**
   * `scope` 依「這個動作實際會蓋掉什麼」選：
   * - `'any'`（預設）：動作會換掉 activeRouteId（切換／建立班次）——表單會因
   *   id 變更而重置，所有未儲存來源都要確認。
   * - `'stops'`：動作只觸發同 id 重讀（改設定、reorder）——重讀只會經
   *   `resetEditing()` 蓋掉名單緩衝，表單編輯安然無恙；若這時還看 `anyDirty`，
   *   「儲存班次設定」本身就必然帶著表單變更，每按一次都會彈出一個語意顛倒的
   *   「捨棄變更」對話框（按「留在這裡」反而取消儲存）。
   */
  async function confirmDiscard(scope: 'any' | 'stops' = 'any'): Promise<boolean> {
    if (!(scope === 'stops' ? dirty.value : anyDirty.value)) return true
    try {
      await ElMessageBox.confirm(
        '這個班次有尚未儲存的變更，離開後會遺失。確定要切換嗎？', '尚未儲存',
        { type: 'warning', confirmButtonText: '捨棄變更', cancelButtonText: '留在這裡' },
      )
      return true
    } catch {
      return false
    }
  }

  async function selectRoute(routeId: number): Promise<boolean> {
    if (routeId === activeRouteId.value) return true
    if (!await confirmDiscard()) return false
    activeRouteId.value = routeId
    resetEditing()
    return true
  }

  /**
   * 建立班次（名稱／方向／出發時間／座位上限必填）。建立後自動選中該班次。
   * 「帶入其他班次名單」由 view 在建立成功後再呼叫 `copyFromRoute`。
   */
  async function createRoute(payload: {
    name: string
    direction: BusDirection
    depart_time: string
    capacity: number
    sort_order?: number
    operator_employee_ids?: number[]
  }): Promise<number | null> {
    // 這支內部會 loadRoutes() → resetEditing()，等於把名單編輯緩衝整份蓋掉。
    // 「新增班次」按鈕在任何時候都能按（頁首與側欄各一個），不擋的話使用者排了
    // 半小時的順序會因為一個語意上毫不相關的動作而消失。
    if (!await confirmDiscard()) return null
    const name = payload.name.trim()
    if (!name) {
      ElMessage.error('請輸入班次名稱')
      return null
    }
    creating.value = true
    try {
      const res = await createBusRoute({
        ...payload,
        name,
        // codegen 把有 default 的欄位標成 required（後端其實選填），補上後端同值預設。
        sort_order: payload.sort_order ?? 0,
      })
      const newId = asNum(dataOf(res).id)
      await loadRoutes()
      if (newId !== null) {
        activeRouteId.value = newId
        resetEditing()
      }
      ElMessage.success('已建立班次')
      return newId
    } catch (e) {
      ElMessage.error(apiError(e, '建立班次失敗'))
      return null
    } finally {
      creating.value = false
    }
  }

  /**
   * 班次基本設定部分更新（`PATCH /bus/routes/{id}`）。**沒有 `direction`**：方向唯讀。
   *
   * 更新成功後一律 `loadRoutes()` 重讀，而 `loadRoutes` 內部的 `resetEditing()`
   * 會把編輯緩衝蓋回伺服器名冊——若當前有未儲存的**站點**編輯，不先確認就直接
   * 改設定，等於用一個語意上毫不相關的動作，靜默丟棄使用者剛排好的順序。
   * 只看 `'stops'`：表單自己的變更就是這次要送出的 payload，不是要被捨棄的東西
   * （同 id 重讀也不會重置表單），看 `anyDirty` 會讓每一次表單儲存都彈確認框。
   */
  async function updateRoute(
    routeId: number,
    payload: {
      name?: string
      depart_time?: string
      capacity?: number
      operator_employee_ids?: number[]
      is_active?: boolean
    },
  ): Promise<boolean> {
    if (!await confirmDiscard('stops')) return false
    updatingRoute.value = true
    try {
      await updateBusRoute(routeId, payload)
    } catch (e) {
      const fallback = errorStatus(e) === 409
        ? '此班次目前有進行中的班次，需完成或取消後才能停用'
        : (payload.is_active === false ? '停用失敗，請稍後再試' : '更新班次失敗，請稍後再試')
      ElMessage.error(apiError(e, fallback))
      updatingRoute.value = false
      return false
    }
    try {
      await loadRoutes()
    } catch (e) {
      ElMessage.warning(apiError(e, '已更新，但重新載入班次清單失敗，畫面可能不是最新狀態'))
    }
    ElMessage.success('已更新班次')
    updatingRoute.value = false
    return true
  }

  /**
   * 班次排序批次調整（`PATCH /bus/routes/reorder`）。`orderedIds` 是**同一方向組內**
   * 的完整順序；`sort_order` 由 index 衍生，由後端一次寫入。
   *
   * 這支不動站點編輯緩衝，故本身不需要確認——但成功後重讀班次清單會經
   * `resetEditing()`，因此仍先確認（只看 `'stops'`：同 id 重讀不會重置表單），
   * 避免拖一下側欄就丟掉名單編輯。
   *
   * 回 false（確認被取消或 PATCH 失敗）＝**什麼都沒寫進去**：呼叫端（view）要
   * 依這個回傳強制側欄重繪——vuedraggable 是單向 `:model-value`，拖放已經動了
   * DOM，若放著不管，畫面會停在「看起來排好了、實際上沒寫進去」的順序。
   */
  async function reorderRoutes(orderedIds: number[]): Promise<boolean> {
    if (!orderedIds.length) return true
    if (!await confirmDiscard('stops')) return false
    reordering.value = true
    try {
      await reorderBusRoutes(orderedIds.map((id, i) => ({ id, sort_order: i })))
    } catch (e) {
      ElMessage.error(apiError(e, '調整班次順序失敗，請稍後再試'))
      reordering.value = false
      return false
    }
    try {
      // **獨立 try**：PATCH 已經 commit 了，重讀失敗不可以再喊一次「調整順序失敗」——
      // 使用者會照著提示再拖一次，等於對同一批班次再寫一次 sort_order。
      await loadRoutes()
    } catch (e) {
      ElMessage.warning(apiError(e, '已調整順序，但重新載入班次清單失敗，畫面可能不是最新狀態'))
    }
    reordering.value = false
    return true
  }

  // ── 編輯 ──────────────────────────────────────────────────────────────────

  function addStop(studentId: number | null): void {
    if (studentId === null) return
    const student = candidates.value.find((s) => s.id === studentId)
    if (!student) return
    if (stops.value.length >= MAX_STOPS_PER_ROUTE) {
      ElMessage.warning(`單一班次最多 ${MAX_STOPS_PER_ROUTE} 站，請改排到其他班次`)
      return
    }
    // 該生在其他同方向班次已佔用的星期一律不預選，否則儲存必定整批 422。
    const rideDays = freeRideDaysFor(student.id)
    stops.value = renumber([
      ...stops.value,
      {
        student_id: student.id,
        student_name: student.name,
        classroom_name: null,
        seq: 0,
        lat: null,
        lng: null,
        address_snapshot: null,
        address_stale: false,
        ride_days: rideDays,
        pinned: false,
        pickup_address_id: null,
        eta_planned: null,
        contacts: [],
      },
    ])
    if (rideDays !== DEFAULT_RIDE_DAYS) {
      const names = assignedElsewhere.value.get(student.id)?.routeNames ?? []
      ElMessage.info(
        `${student.name} 已排在「${names.join('、')}」，僅預選其餘星期，可自行調整`,
      )
    }
    dirty.value = true
  }

  function removeStop(index: number): void {
    if (index < 0 || index >= stops.value.length) return
    stops.value = renumber(stops.value.filter((_, i) => i !== index))
    dirty.value = true
  }

  /**
   * 拖拉落點重排（`from` → `to`）。**被拖動的那一站自動釘選**（spec 手動調整決策：
   * 釘選權重 > 系統排序），否則下一次自動排序會把剛調好的順序洗掉。
   * 使用者可用 `togglePinned` 一鍵解除。
   */
  function moveStop(from: number, to: number): void {
    const list = stops.value
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, { ...moved, pinned: true })
    stops.value = renumber(next)
    dirty.value = true
  }

  function togglePinned(index: number): void {
    if (index < 0 || index >= stops.value.length) return
    stops.value = stops.value.map((s, i) => (i === index ? { ...s, pinned: !s.pinned } : s))
    dirty.value = true
  }

  /**
   * 設定該站搭乘星期。兩道前置擋，都是「送出去必定 422」的情境，提前講比等後端好：
   * 1. 一天都不選（mask 0）——後端 `ride_days` 有 `ge=1`。
   * 2. 與其他同方向班次的既有 ride_days 有交集——跨班次重複規則。
   */
  function setRideDays(index: number, rideDays: number): void {
    const stop = stops.value[index]
    if (!stop) return
    const mask = rideDays & FULL_WEEK_RIDE_DAYS
    if (mask === 0) {
      ElMessage.warning('至少要選一天；整週都不搭請直接移除該站')
      return
    }
    const taken = assignedElsewhere.value.get(stop.student_id)
    if (taken && rideDaysOverlap(mask, taken.mask)) {
      const clash = rideDaysToWeekdays(mask & taken.mask).map((i) => WEEKDAY_LABELS[i]).join('、')
      ElMessage.error(
        `${stop.student_name} 週${clash}已排在「${taken.routeNames.join('、')}」，同方向不可重複`,
      )
      return
    }
    stops.value = stops.value.map((s, i) => (i === index ? { ...s, ride_days: mask } : s))
    dirty.value = true
  }

  /**
   * 套用 `BusPickupAddressSelect` 選定的接送地址。
   * `addressId === null` 的語意是**住家地址**，不是「清除地址」。
   */
  function setPickupAddress(
    index: number,
    resolved: { id: number | null; lat: number | null; lng: number | null; address: string | null },
  ): void {
    if (index < 0 || index >= stops.value.length) return
    stops.value = stops.value.map((s, i) => {
      if (i !== index) return s
      // **選同一筆地址時不得把既有座標清成 null**。後端的「住家」虛擬項是寫死的
      // `lat/lng: None`（api/bus/pickup_addresses.py），所以對一個原本就用住家、
      // 且已經微調好座標的站再點一次住家，無條件覆寫等於把它推進「無法發車」，
      // 而且沒有回頭路。地址真的換了（id 不同）才允許座標歸零。
      const sameAddress = s.pickup_address_id === resolved.id
      return {
        ...s,
        pickup_address_id: resolved.id,
        lat: resolved.lat ?? (sameAddress ? s.lat : null),
        lng: resolved.lng ?? (sameAddress ? s.lng : null),
        address_snapshot: resolved.address ?? (sameAddress ? s.address_snapshot : null),
        // 剛從地址簿選出來的就是現值，不可能是過期快照。
        address_stale: false,
      }
    })
    dirty.value = true
  }

  /** 地圖微調（`BusStopMapTuner`）回寫實際上下車點；地址文字不變。 */
  function setCoordinates(studentId: number, lat: number, lng: number): void {
    stops.value = stops.value.map((s) => (s.student_id === studentId ? { ...s, lat, lng } : s))
    dirty.value = true
  }

  /**
   * 帶入其他班次名單（`POST /routes/{id}/copy-from`，預覽不落庫）。
   * 複製來源班次的 `ride_days`／`pinned`／`pickup_address_id` 全欄位；`reverse`
   * 預設 true（早上最後接的，下午最先送）。
   *
   * 衝突學生**仍會出現在預覽清單裡**並記進 `copyConflicts` 供 view 標示——真正
   * 擋下來的是儲存（整批 422）。這與後端「預覽仍回清單、儲存才擋」的口徑一致，
   * 讓使用者能看到全貌後自己決定要移除誰。
   */
  async function copyFromRoute(sourceRouteId: number, reverse = true): Promise<boolean> {
    const routeId = activeRouteId.value
    if (routeId === null || copying.value) return false
    // 站點被全部刪光時 `length === 0` 但 `dirty === true`，那也是「會被覆寫掉的
    // 未儲存編輯」，不能跳過確認。
    if (stops.value.length > 0 || dirty.value) {
      try {
        await ElMessageBox.confirm(
          '目前的名單會被帶入的名單取代，確定嗎？', '帶入其他班次名單',
          { type: 'warning', confirmButtonText: '帶入', cancelButtonText: '取消' },
        )
      } catch {
        return false
      }
    }
    copying.value = true
    try {
      const res = await copyBusRouteFrom(routeId, {
        source_route_id: sourceRouteId, reverse, preview: true,
      })
      const raw = dataOf(res).stops
      const preview = normalizeStops(raw)
      if (!preview.length) {
        ElMessage.warning('來源班次的名單是空的，沒有可帶入的站點')
        return false
      }
      const conflicts: CopyFromConflict[] = (Array.isArray(raw) ? raw : []).flatMap((item) => {
        const r = asRecord(item)
        if (!r || !asBool(r.conflict)) return []
        const studentId = asNum(r.student_id)
        if (studentId === null) return []
        return [{
          student_id: studentId,
          student_name: asStr(r.student_name) ?? '',
          conflict_route_name: asStr(r.conflict_route_name),
        }]
      })
      stops.value = renumber(preview)
      copyConflicts.value = conflicts
      dirty.value = true
      if (conflicts.length) {
        ElMessage.warning(
          `已帶入 ${preview.length} 站，其中 ${conflicts.length} 位學生與其他班次重複，需移除後才能儲存`,
        )
      } else {
        ElMessage.success(`已帶入 ${preview.length} 站，確認後請按儲存`)
      }
      return true
    } catch (e) {
      ElMessage.error(apiError(e, '帶入名單失敗，請稍後再試'))
      return false
    } finally {
      copying.value = false
    }
  }

  // ── 自動排序與 ETA ─────────────────────────────────────────────────────────

  /**
   * 兩支最佳化端點都是**對伺服器上已儲存的名單**運算的（後端讀 DB，不看前端緩衝）。
   * 有未儲存變更時先擋下來——否則預覽出來的順序是別的名單的，套用後只會更亂。
   */
  function requireSavedBuffer(action: string): boolean {
    if (!dirty.value) return true
    ElMessage.warning(`有尚未儲存的名單變更，請先儲存再${action}`)
    return false
  }

  /** 自動排序預覽（不落庫）。回 null＝失敗或被擋下，由 view 決定不開 Dialog。 */
  async function optimizePreview(): Promise<RouteOptimizePreview | null> {
    const routeId = activeRouteId.value
    if (routeId === null || optimizing.value || recomputingEtas.value) return null
    if (!requireSavedBuffer('自動排序')) return null
    optimizeErrorMessage.value = null
    optimizing.value = true
    try {
      const res = await optimizeBusRoute(routeId, { apply: false })
      const data = dataOf(res)
      const raw = Array.isArray(data.stops) ? data.stops : []
      return {
        applied: asBool(data.applied),
        end_time_planned: asStr(data.end_time_planned),
        moved_unpinned_student_ids: (Array.isArray(data.moved_unpinned_student_ids)
          ? data.moved_unpinned_student_ids
          : []).flatMap((v) => {
          const n = asNum(v)
          return n === null ? [] : [n]
        }),
        stops: raw.flatMap((item) => {
          const r = asRecord(item)
          const studentId = r ? asNum(r.student_id) : null
          if (r === null || studentId === null) return []
          return [{
            student_id: studentId,
            seq: asNum(r.seq) ?? 0,
            eta_planned: asStr(r.eta_planned),
          }]
        }),
      }
    } catch (e) {
      const message = apiError(e, '自動排序失敗，請稍後再試')
      optimizeErrorMessage.value = message
      ElMessage.error(message)
      return null
    } finally {
      optimizing.value = false
    }
  }

  /**
   * 把預覽套用到編輯緩衝——**只改順序與 ETA，仍需按儲存才落庫**（`apply: false`
   * 預覽不落庫，這裡也不偷偷替使用者送出）。預覽沒提到的站維持原相對順序排在後面。
   */
  function applyOptimize(preview: RouteOptimizePreview): void {
    const seqOf = new Map(preview.stops.map((s) => [s.student_id, s.seq]))
    const etaOf = new Map(preview.stops.map((s) => [s.student_id, s.eta_planned]))
    const next = [...stops.value]
      .map((s, i) => ({
        stop: etaOf.has(s.student_id) ? { ...s, eta_planned: etaOf.get(s.student_id) ?? null } : s,
        // 預覽未涵蓋的站排到最後，並以原索引維持相對順序
        key: seqOf.get(s.student_id) ?? Number.MAX_SAFE_INTEGER,
        i,
      }))
      .sort((a, b) => (a.key - b.key) || (a.i - b.i))
      .map((x) => x.stop)
    stops.value = renumber(next)
    dirty.value = true
  }

  /**
   * 順序固定重算 ETA（`POST /routes/{id}/recompute-etas`）：不動順序，只依現有 seq
   * 重算 `eta_planned` 與 `end_time_planned`。**這支會落庫**，成功後重讀班次清單。
   */
  async function recomputeEtas(): Promise<boolean> {
    const routeId = activeRouteId.value
    if (routeId === null || optimizing.value || recomputingEtas.value) return false
    if (!requireSavedBuffer('重算 ETA')) return false
    recomputingEtas.value = true
    try {
      await recomputeBusRouteEtas(routeId)
    } catch (e) {
      ElMessage.error(apiError(e, '重算 ETA 失敗，請稍後再試'))
      recomputingEtas.value = false
      return false
    }
    try {
      await loadRoutes()
      ElMessage.success('已重算預計抵達時間')
    } catch (e) {
      // recompute 已經落庫，重讀失敗不可以再喊一次「重算失敗」讓使用者重送。
      ElMessage.warning(apiError(e, '已重算，但重新載入名冊失敗，畫面可能不是最新狀態'))
    } finally {
      recomputingEtas.value = false
    }
    return true
  }

  // ── 儲存 ──────────────────────────────────────────────────────────────────

  async function save(): Promise<void> {
    const routeId = activeRouteId.value
    if (routeId === null || saving.value) return
    // replace-all：空清單＝把整條班次的名單清掉，不可以是一個沒有回頭路的誤觸
    if (stops.value.length === 0 && savedStops.value.length > 0) {
      try {
        await ElMessageBox.confirm(
          `儲存後會清空「${activeRoute.value?.name ?? '此班次'}」的全部 ${savedStops.value.length} 個站點，確定嗎？`,
          '清空站點',
          { type: 'warning', confirmButtonText: '清空並儲存', cancelButtonText: '取消' },
        )
      } catch {
        return
      }
    }
    const hadEta = stops.value.some((s) => s.eta_planned !== null)
    saving.value = true
    try {
      await replaceBusRouteStops(
        routeId,
        stops.value.map((s, i) => ({
          student_id: s.student_id,
          seq: i + 1,
          lat: s.lat,
          lng: s.lng,
          ride_days: s.ride_days,
          pinned: s.pinned,
          pickup_address_id: s.pickup_address_id,
        })),
      )
    } catch (e) {
      // 失敗時**保留**編輯緩衝：整批 422（跨班次重複／capacity 超載／已離校學生／
      // 超過 60 站）時重讀會把使用者剛排好的順序整個丟掉。
      ElMessage.error(apiError(e, '儲存失敗，請確認名單後再試'))
      saving.value = false
      return
    }
    ElMessage.success('已儲存')
    try {
      // 以伺服器回傳為權威重讀（含 address_snapshot／eta_planned 等後端補的欄位）。
      // **獨立 try**：PUT 已經 commit 了，重讀失敗不可以再喊一次「儲存失敗」——
      // 使用者會照著提示重送，等於對同一條班次再跑一次 replace-all。
      await loadRoutes()
      if (missingCoordinateCount.value > 0) {
        ElMessage.warning(
          `仍有 ${missingCoordinateCount.value} 站沒有座標，需先設定接送地址才能發車`,
        )
      }
      // 後端 `replace_stops` 不寫 `eta_planned`、也不動 `route.end_time_planned`
      // （StopIn 沒有這個欄位，前端也送不上去）。所以只要儲存前緩衝裡有 ETA，
      // 重讀回來就會整欄變「—」而 end_time_planned 停在舊順序的過期預估。
      // 這件事不講，使用者只會看到 ETA 集體消失，不知道要按「重算預計抵達」。
      if (hadEta) {
        ElMessage.warning('名單已儲存；順序或名單變更後的預計抵達時間，請按「重算預計抵達」重新計算')
      }
    } catch (e) {
      ElMessage.warning(apiError(e, '已儲存，但重新載入名冊失敗，畫面可能不是最新狀態'))
    } finally {
      saving.value = false
    }
  }

  return {
    routes, activeRoute, activeRouteId, stops, students, candidates, savedStops,
    capacity, weekdayLoads, maxWeekdayLoad, overloadedWeekdays,
    missingCoordinateCount, staleAddressCount, assignedElsewhere, copyConflicts,
    optimizeErrorMessage, anyDirty, registerExtraDirty,
    loading, saving, creating, updatingRoute, reordering, optimizing, recomputingEtas,
    copying, dirty,
    loadFailed, studentsFailed,
    init, loadRoutes, createRoute, selectRoute, updateRoute, reorderRoutes, confirmDiscard,
    addStop, removeStop, moveStop, togglePinned, setRideDays, setPickupAddress, setCoordinates,
    copyFromRoute, optimizePreview, applyOptimize, recomputeEtas, save,
    freeRideDaysFor,
  }
}
