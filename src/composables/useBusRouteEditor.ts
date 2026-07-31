/**
 * 管理端娃娃車路線編輯（`/bus-routes` 專用，非 module singleton）。
 *
 * 後端 `PUT /api/bus/routes/{id}/stops` 是**整方向 replace-all**：送出的清單就是該
 * 路線該方向的全部站點，沒送的一律刪除。本檔因此持有一份「編輯緩衝」（`stops`），
 * 與伺服器上的名冊（`routes[].stops`）分開，只有按下儲存才同步。
 *
 * ── 依 repo 實況修正 brief 之處 ───────────────────────────────────────────────
 *
 * 1. **不自動建立路線**。brief 的 `load()` 在沒有任何路線時直接
 *    `createBusRoute('主線')`——那是「開啟一個唯讀頁面就寫進一筆資料」，而後端
 *    **沒有**刪除或停用路線的端點（`api/bus/admin_routes.py` 只有 GET/POST/PUT
 *    stops/geocode），誤建的路線刪不掉也停不掉，只能留在資料庫裡。改為空狀態 +
 *    使用者顯式命名建立。
 *
 * 2. **未儲存的編輯不得靜默丟棄**。brief 切換早／晚 tab 時直接重讀伺服器資料，
 *    半小時的排序工作按錯一個 tab 就沒了。切換路線／方向前一律先確認。
 *
 * 3. **站數上限與後端對齊**（`MAX_STOPS_PER_DIRECTION = 60`）。超過的話是整批 422，
 *    使用者會在按下儲存、加完第 61 個學生之後才知道。
 *
 * 4. **候選名單要排掉「後端一定會拒絕」的學生**：同方向已排在**別條路線**的學生會
 *    觸發 `_reject_cross_route_duplicates` 的 422（整批失敗）。已在本方向清單裡的
 *    當然也要排掉（同路線重複會撞 `uq_bus_route_stops_member`）。
 *
 * 5. **學生清單要翻頁**。`GET /api/students` 的 `limit` 上限是 500（`le=500`）且預設
 *    只回 50 筆；brief 的 `{ limit: 500 }` 在學生數超過 500 時會靜默少掉一批人，
 *    而「找不到某個孩子」在這一頁看起來像是「這孩子不能搭車」。
 *
 * ── 隱私 ────────────────────────────────────────────────────────────────────
 * `GET /api/students` 回傳含家長姓名／電話／住址；本檔只留 `id`/`name` 進狀態
 * （Vue devtools 與任何序列化都看不到其餘欄位）。座標本身管理端有權查看，但一律
 * 不進 console / Sentry / URL query / localStorage / sessionStorage。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createBusRoute, geocodeBusStudent, listBusRoutes, replaceBusRouteStops,
} from '@/api/bus'
import { getStudents } from '@/api/students'
import { apiError } from '@/utils/error'

/** 與後端 `api/bus/admin_routes.py::MAX_STOPS_PER_DIRECTION` 對齊。 */
export const MAX_STOPS_PER_DIRECTION = 60
/** `GET /api/students` 的 `limit` 上限（後端 `Query(50, ge=1, le=500)`）。 */
export const STUDENT_PAGE_SIZE = 500
/** 翻頁保險絲：後端 total 異常時不至於變成無窮迴圈。 */
const MAX_STUDENT_PAGES = 20

export type BusDirection = 'morning' | 'afternoon'

export const DIRECTION_LABELS: Record<BusDirection, string> = {
  morning: '早上接學生',
  afternoon: '下午送學生',
}

export interface BusStopDraft {
  student_id: number
  student_name: string
  seq: number
  lat: number | null
  lng: number | null
}
export interface BusRouteRow {
  id: number
  name: string
  is_active: boolean
  stops: Record<BusDirection, BusStopDraft[]>
}

// ── 型別 narrow（禁 any；codegen 涵蓋 /bus 後可退場）──
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
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
      seq: asNum(r.seq) ?? 0,
      lat: asNum(r.lat),
      lng: asNum(r.lng),
    }]
  })
}

/** 重新編號成 1..n；`seq` 重複時後端 422（DB 無約束但排序會失去決定性）。 */
function renumber(list: BusStopDraft[]): BusStopDraft[] {
  return list.map((s, i) => ({ ...s, seq: i + 1 }))
}

export function useBusRouteEditor() {
  const routes = ref<BusRouteRow[]>([])
  const activeRouteId = ref<number | null>(null)
  const direction = ref<BusDirection>('morning')
  /** 編輯緩衝；與伺服器名冊分離，按下儲存才同步。 */
  const stops = ref<BusStopDraft[]>([])
  /** 全園在讀學生，只留 id/name。 */
  const students = ref<Array<{ id: number; name: string }>>([])
  const loading = ref(true)
  const saving = ref(false)
  const creating = ref(false)
  const geocodingStudentId = ref<number | null>(null)
  /** 路線清單載入失敗：`routes` 是空的，但**不是**「園裡沒有路線」。 */
  const loadFailed = ref(false)
  /** 學生清單載入失敗：候選名單是空的，但**不是**「沒有學生可以加」。 */
  const studentsFailed = ref(false)
  /** 編輯緩衝與伺服器名冊已分岔；切換路線／方向與離開頁面前要提醒。 */
  const dirty = ref(false)

  const activeRoute = computed(() => routes.value.find((r) => r.id === activeRouteId.value) ?? null)
  /** 伺服器上目前這條路線這個方向的名冊（用來判斷「儲存會不會清空」）。 */
  const savedStops = computed(() => activeRoute.value?.stops[direction.value] ?? [])
  /** 同方向已排在**別條**路線的學生：送出去一定 422（後端擋跨路線重複指派）。 */
  const assignedElsewhere = computed(() => {
    const ids = new Set<number>()
    for (const route of routes.value) {
      if (route.id === activeRouteId.value) continue
      for (const stop of route.stops[direction.value]) ids.add(stop.student_id)
    }
    return ids
  })
  const candidates = computed(() => {
    const picked = new Set(stops.value.map((s) => s.student_id))
    return students.value.filter((s) => !picked.has(s.id) && !assignedElsewhere.value.has(s.id))
  })
  const missingCoordinateCount = computed(
    () => stops.value.filter((s) => s.lat == null || s.lng == null).length,
  )

  function resetEditing(): void {
    stops.value = savedStops.value.map((s) => ({ ...s }))
    dirty.value = false
  }

  // ── 載入 ──────────────────────────────────────────────────────────────────

  /** 路線與名冊。**不自動建立路線**——後端沒有刪除／停用端點，誤建的刪不掉。 */
  async function loadRoutes(): Promise<void> {
    const res = await listBusRoutes()
    const data = asRecord((res as { data?: unknown }).data) ?? {}
    const raw = Array.isArray(data.routes) ? data.routes : []
    routes.value = raw.flatMap((item) => {
      const r = asRecord(item)
      const id = r ? asNum(r.id) : null
      if (r === null || id === null) return []
      const byDirection = asRecord(r.stops) ?? {}
      return [{
        id,
        name: asStr(r.name) ?? `路線 #${id}`,
        is_active: r.is_active !== false,
        stops: {
          morning: normalizeStops(byDirection.morning),
          afternoon: normalizeStops(byDirection.afternoon),
        },
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
      const data = asRecord((res as { data?: unknown }).data) ?? {}
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
   * 進頁載入。**路線與學生分開判定成敗**：
   *
   * 1. 路線載入失敗時 `routes` 會停在初始 `[]`，畫面若照樣渲染「尚未建立任何路線 +
   *    建立第一條路線」，一次 403／500／斷網就會誘導管理者建出一條**後端沒有端點可以
   *    刪除**的重複路線。因此獨立一個 `loadFailed`，由 view 以錯誤卡取代空狀態並停用
   *    建立按鈕（與監看頁 `snapshotFailed` 同一條原則：畫面不得把「連不上」講成「沒有」）。
   * 2. 學生清單失敗只讓候選名單變空，用「載入娃娃車路線失敗」的訊息指錯對象；
   *    空的候選選單看起來也像「沒有學生可以加」，故另立 `studentsFailed` 讓 UI 明說。
   *
   * 用 `allSettled` 而非 `Promise.all`：後者一邊失敗就不知道另一邊的結果，兩個旗標
   * 沒辦法各自判定。
   */
  async function init(): Promise<void> {
    loading.value = true
    loadFailed.value = false
    studentsFailed.value = false
    const [routesResult, studentsResult] = await Promise.allSettled([loadRoutes(), loadStudents()])
    if (routesResult.status === 'rejected') {
      loadFailed.value = true
      ElMessage.error(apiError(routesResult.reason, '載入娃娃車路線失敗，請重新整理'))
    }
    if (studentsResult.status === 'rejected') {
      studentsFailed.value = true
      ElMessage.error(apiError(studentsResult.reason, '載入學生名單失敗，暫時無法加入新站點'))
    }
    loading.value = false
  }

  // ── 切換（未儲存的編輯要先確認）─────────────────────────────────────────────

  async function confirmDiscard(): Promise<boolean> {
    if (!dirty.value) return true
    try {
      await ElMessageBox.confirm(
        '這個方向有尚未儲存的變更，離開後會遺失。確定要切換嗎？', '尚未儲存',
        { type: 'warning', confirmButtonText: '捨棄變更', cancelButtonText: '留在這裡' },
      )
      return true
    } catch {
      return false
    }
  }

  async function setDirection(next: BusDirection): Promise<boolean> {
    if (next === direction.value) return true
    if (!await confirmDiscard()) return false
    direction.value = next
    resetEditing()
    return true
  }

  async function selectRoute(routeId: number): Promise<boolean> {
    if (routeId === activeRouteId.value) return true
    if (!await confirmDiscard()) return false
    activeRouteId.value = routeId
    resetEditing()
    return true
  }

  async function createRoute(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      ElMessage.error('請輸入路線名稱')
      return
    }
    creating.value = true
    try {
      const res = await createBusRoute(trimmed)
      const created = asRecord((res as { data?: unknown }).data)
      const newId = created ? asNum(created.id) : null
      await loadRoutes()
      if (newId !== null) {
        activeRouteId.value = newId
        resetEditing()
      }
      ElMessage.success('已建立路線')
    } catch (e) {
      ElMessage.error(apiError(e, '建立路線失敗'))
    } finally {
      creating.value = false
    }
  }

  // ── 編輯 ──────────────────────────────────────────────────────────────────

  function addStop(studentId: number | null): void {
    if (studentId === null) return
    const student = candidates.value.find((s) => s.id === studentId)
    if (!student) return
    if (stops.value.length >= MAX_STOPS_PER_DIRECTION) {
      ElMessage.warning(`單一方向最多 ${MAX_STOPS_PER_DIRECTION} 站，請改排到其他路線`)
      return
    }
    stops.value = renumber([
      ...stops.value,
      { student_id: student.id, student_name: student.name, seq: 0, lat: null, lng: null },
    ])
    dirty.value = true
  }

  function removeStop(index: number): void {
    if (index < 0 || index >= stops.value.length) return
    stops.value = renumber(stops.value.filter((_, i) => i !== index))
    dirty.value = true
  }

  function move(index: number, delta: number): void {
    const target = index + delta
    if (index < 0 || index >= stops.value.length) return
    if (target < 0 || target >= stops.value.length) return
    const next = [...stops.value]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    stops.value = renumber(next)
    dirty.value = true
  }

  function setCoordinates(studentId: number, lat: number, lng: number): void {
    stops.value = stops.value.map(
      (s) => (s.student_id === studentId ? { ...s, lat, lng } : s),
    )
    dirty.value = true
  }

  /** 依學生住址查座標（後端不落庫，隨儲存一起送）。 */
  async function geocodeStop(studentId: number): Promise<void> {
    if (geocodingStudentId.value !== null) return
    geocodingStudentId.value = studentId
    try {
      const res = await geocodeBusStudent(studentId)
      const data = asRecord((res as { data?: unknown }).data) ?? {}
      const lat = asNum(data.lat)
      const lng = asNum(data.lng)
      if (lat === null || lng === null) {
        ElMessage.error('查無座標，請在地圖上手動放置')
        return
      }
      setCoordinates(studentId, lat, lng)
      ElMessage.success('已帶入座標（僅到巷弄層級，請在地圖上微調到正確門口）')
    } catch (e) {
      ElMessage.error(apiError(e, '查無座標，請在地圖上手動放置'))
    } finally {
      geocodingStudentId.value = null
    }
  }

  /** 下午送＝早上接的反序（座標一併沿用，同一戶人家）。 */
  async function mirrorFromMorning(): Promise<void> {
    if (direction.value !== 'afternoon') return
    const morning = activeRoute.value?.stops.morning ?? []
    if (!morning.length) {
      ElMessage.warning('早上接的名冊是空的，沒有可帶入的站點')
      return
    }
    if (stops.value.length > 0) {
      try {
        await ElMessageBox.confirm(
          '目前下午送的名冊會被早上接的反序取代，確定要帶入嗎？', '帶入早接反序',
          { type: 'warning', confirmButtonText: '帶入', cancelButtonText: '取消' },
        )
      } catch {
        return
      }
    }
    stops.value = renumber([...morning].reverse().map((s) => ({ ...s })))
    dirty.value = true
  }

  // ── 儲存 ──────────────────────────────────────────────────────────────────

  async function save(): Promise<void> {
    const routeId = activeRouteId.value
    if (routeId === null || saving.value) return
    // replace-all：空清單＝把這個方向整個清掉，不可以是一個沒有回頭路的誤觸
    if (stops.value.length === 0 && savedStops.value.length > 0) {
      try {
        await ElMessageBox.confirm(
          `儲存後會清空「${DIRECTION_LABELS[direction.value]}」的全部 ${savedStops.value.length} 個站點，確定嗎？`,
          '清空站點',
          { type: 'warning', confirmButtonText: '清空並儲存', cancelButtonText: '取消' },
        )
      } catch {
        return
      }
    }
    saving.value = true
    try {
      await replaceBusRouteStops(
        routeId,
        direction.value,
        stops.value.map((s, i) => ({ student_id: s.student_id, seq: i + 1, lat: s.lat, lng: s.lng })),
      )
    } catch (e) {
      // 失敗時**保留**編輯緩衝：整批 422（重複指派／已離校學生／超過 60 站）時
      // 重讀會把使用者剛排好的順序整個丟掉。
      ElMessage.error(apiError(e, '儲存失敗，請確認名單後再試'))
      saving.value = false
      return
    }
    ElMessage.success('已儲存')
    try {
      // 以伺服器回傳為權威重讀（含 address_snapshot 等後端補的欄位）。
      // **獨立 try**：PUT 已經 commit 了，重讀失敗不可以再喊一次「儲存失敗」——
      // 使用者會照著提示重送，等於對同一個方向再跑一次 replace-all。
      await loadRoutes()
      if (missingCoordinateCount.value > 0) {
        ElMessage.warning(`仍有 ${missingCoordinateCount.value} 站沒有座標，家長端不會看到該站位置`)
      }
    } catch (e) {
      ElMessage.warning(apiError(e, '已儲存，但重新載入名冊失敗，畫面可能不是最新狀態'))
    } finally {
      saving.value = false
    }
  }

  return {
    routes, activeRoute, activeRouteId, direction, stops, students, candidates,
    savedStops, missingCoordinateCount, loading, saving, creating, geocodingStudentId, dirty,
    loadFailed, studentsFailed,
    init, loadRoutes, createRoute, selectRoute, setDirection,
    addStop, removeStop, move, setCoordinates, geocodeStop, mirrorFromMorning, save,
  }
}
