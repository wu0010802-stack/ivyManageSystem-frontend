/**
 * 娃娃車 API（隨車老師 portal 班次操作 ＋ 管理端班次設定／當日調度／監看），
 * 對應後端 `api/bus/`。
 *
 * 權限分界（後端 `api/bus/portal_trips.py` / `api/bus/admin_routes.py`
 * / `api/bus/daily_plans.py` / `api/bus/pickup_addresses.py`）：
 * - portal 區塊：`BUS_TRIPS_OPERATE`（per-user 顯式授權，無 role 預設）
 * - admin 區塊：讀 `BUS_READ`、寫 `BUS_WRITE`
 * - daily-plans 寫入：`BUS_WRITE`（planned）／`BUS_IN_PROGRESS_WRITE`（in_progress），
 *   後端 Depends 層收 any-of、handler 內依 trip.status 精判——前端不自行推斷，
 *   一律以後端 403 為準，但 UI 應先隱藏/disable 無權限的動作（見 spec「當日計畫」）。
 *
 * ⚠ **班次清單有兩支，不可混用**：
 * - `listPortalBusRoutes`（`GET /portal/bus/routes`，`BUS_TRIPS_OPERATE`）回開班選單
 *   所需的班次列表（含 `direction`／`depart_time`／`sort_order`／當日四態），
 *   **不含 stops**，是**隨車頁唯一該用的那支**。
 * - `listBusRoutes`（`GET /bus/routes`，`BUS_READ`）回全班次名冊（學生姓名與接送地址
 *   座標），僅供管理端。為了讓隨車老師能開班而補授 `BUS_READ` 等於把全園學生住址
 *   一併給出去。
 *
 * 型別：`/bus`（管理端）與 `/portal/bus` 路徑皆已進
 * `src/api/_generated/schema.d.ts`，全部改用 `ApiQuery`/`ApiBody`/`AxiosResp`
 * 對齊 codegen 型別。**不得**把後端 schema 手抄成共用型別檔（CLAUDE.md：禁止手寫
 * 對應型別）。
 *
 * 隱私（沿用第一期規範，範圍依 spec「前端（admin）模組拆分」放寬為「保留本頁需要
 * 的欄位」）：站點回應含 `lat`/`lng`（接送地址 geocode 快照）與 `address_snapshot`，
 * 呼叫端**不得**把座標數字或地址寫進 console／Sentry／URL query／localStorage；
 * 座標僅供最佳化、ETA 與地圖微調起始位置使用。
 */
import api, { API_BASE } from './index'
import { tenantHeaders } from '@/utils/tenant'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// --- Portal（隨車老師，Permission.BUS_TRIPS_OPERATE） ---

/**
 * 開班選單的班次列表（`GET /portal/bus/routes`）：依 `sort_order` 排序，帶
 * `direction`／`depart_time`／`today_status`（none／planned／in_progress／completed）
 * ／`today_trip_id`，**不含站點名冊**。與 `POST /portal/bus/trips` 同權限，隨車
 * 老師不需要 `BUS_READ` 就能自行開班。
 */
export const listPortalBusRoutes = (): AxiosResp<'/portal/bus/routes', 'get'> =>
  api.get('/portal/bus/routes')

/**
 * 開始班次（`POST /portal/bus/trips`）；成功 201 回 `{trip, stops}`。
 *
 * ⚠ 契約破壞（spec「第一期契約破壞清單」）：`TripStartIn.direction` 已移除，方向由
 * 班次（route）衍生。後端行為＝「當日已有 `planned` 就接手轉 `in_progress`，沒有就
 * 先懶生成再轉」，前端不需要先呼叫 daily-plans。
 *
 * 錯誤碼（由呼叫端呈現，不在此攔截）：
 * - 422：發車驗證失敗——缺座標學生清單／該班次名單超過 `capacity`。
 * - 409：`bus.bus_count` 併發上限已滿，或該班次已有進行中班次（帶 `trip_id` 供接手）。
 */
export const startBusTrip = (routeId: number): AxiosResp<'/portal/bus/trips', 'post'> =>
  api.post('/portal/bus/trips', { route_id: routeId } satisfies ApiBody<'/portal/bus/trips', 'post'>)

/**
 * 取進行中的班次。三個過濾維度彼此 AND，回傳形狀一律 `{trip, stops}`。
 *
 * ⚠ **一個維度都不帶＝全域查詢**（後端挑最近一筆 in_progress，任何班次、任何操作者），
 * 多班次同時開班就會回到別條班次的完整站點名冊——那是含學生姓名與接送地址座標的個資。
 * - 進頁復原用 `mine=true`（後端 `8836ecde`：比對 `BusTrip.operator_employee_id`
 *   與 token 的 employee_id；帳號未綁員工回 **403**，刻意不默默退化成「回任何人的」）。
 * - 已知班次的重新同步（開班 409 接手、站點 409 分岔）用 `route_id`；`direction`
 *   維度後端仍保留（歷史查詢），但班次已是單方向，一般不需要再帶。
 *
 * `mine` 預設 false＝後端改動前的行為，向後相容。
 */
export const getActiveBusTrip = (
  routeId?: number | null,
  direction?: 'morning' | 'afternoon' | null,
  mine = false,
): AxiosResp<'/portal/bus/trips/active', 'get'> =>
  api.get('/portal/bus/trips/active', {
    params: {
      ...(routeId ? { route_id: routeId } : {}),
      ...(direction ? { direction } : {}),
      ...(mine ? { mine: true } : {}),
    },
  })

/** 批次上報座標；成功 204 無 body。points 上限 30 筆，任一點不合法整批 422。 */
export const postBusPings = (
  tripId: number,
  points: Array<{ lat: number; lng: number; accuracy?: number; at: string }>,
) => api.post(`/portal/bus/trips/${tripId}/pings`, { points })

/**
 * 頁面即將消失時的最後一次上報（`pagehide`）。**不走 axios**：分頁一旦進入
 * 卸載流程，一般 XHR／fetch 會被瀏覽器連同分頁一起取消，最後一批座標就此消失。
 * `keepalive: true` 明確要求瀏覽器在頁面消失後仍把這個請求送完。
 *
 * 為什麼不用 `navigator.sendBeacon`：beacon 無法帶自訂 header，多租戶的
 * `X-Tenant-Slug` 斷言通道會整個斷掉（後端 `TENANT_HEADER_MODE` 一致性檢查會擋）。
 *
 * 契約與限制：
 * - **同步回傳、不等結果**。頁面正在關閉，沒有可以 await 的未來；呼叫端不得依賴回傳值
 *   判斷是否送達（真的送不出去也無從補救，這本來就是盡力而為的最後一搏）。
 * - `keepalive` 的 body 上限是 64KB（規範值），30 點的批次約 3KB，遠低於上限。
 * - CSRF 走後端 `CSRFOriginCheckMiddleware` 的 Origin 檢查，fetch 會自動帶正確
 *   `Origin`，因此不需要額外的 token header。
 * - cookie 用 `credentials: 'include'`，對齊 axios 實例的 `withCredentials`。
 *
 * 回傳 `false` 代表這個環境根本發不出去（沒有 fetch，或 fetch 同步就丟例外）；
 * 回傳 `true` 只代表「已交給瀏覽器」，不保證後端收到。
 */
export function postBusPingsKeepalive(
  tripId: number,
  points: Array<{ lat: number; lng: number; accuracy?: number; at: string }>,
): boolean {
  if (typeof fetch !== 'function' || points.length === 0) return false
  try {
    void fetch(`${API_BASE}/portal/bus/trips/${tripId}/pings`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...tenantHeaders() },
      body: JSON.stringify({ points }),
      // 頁面正在消失，錯誤沒有任何可行動的後續；吞掉以免變成未處理的 rejection。
    }).catch(() => {})
    return true
  } catch {
    return false
  }
}

export const departBusStop = (tripId: number, stopId: number) =>
  api.post(`/portal/bus/trips/${tripId}/stops/${stopId}/depart`)

export const skipBusStop = (tripId: number, stopId: number) =>
  api.post(`/portal/bus/trips/${tripId}/stops/${stopId}/skip`)

export const undoBusStop = (tripId: number, stopId: number) =>
  api.post(`/portal/bus/trips/${tripId}/stops/${stopId}/undo`)

export const completeBusTrip = (tripId: number) =>
  api.post(`/portal/bus/trips/${tripId}/complete`)

// --- Admin：班次設定（Permission.BUS_READ / BUS_WRITE） ---

/**
 * 班次清單（`GET /bus/routes`，`BUS_READ`）。
 *
 * ⚠ 契約破壞：回應已**塌平**——第一期的 `{morning, afternoon}` 兩桶改為 route 層
 * `direction` ＋單一 `stops` 清單；route 另帶 `depart_time`／`end_time_planned`／
 * `sort_order`／`capacity`／`operators`。呼叫端（`useBusRouteEditor`）的 normalize
 * 必須依 route.direction 分組，不可再讀 `stops.morning`。
 */
export const listBusRoutes = (): AxiosResp<'/bus/routes', 'get'> => api.get('/bus/routes')

/**
 * 建立班次（`POST /bus/routes`，`BUS_WRITE`）。
 * `name`／`direction`／`depart_time`／`capacity` 必填（方向建立後不可改——migration
 * 已依方向拆分班次）；`sort_order` 省略時後端預設 0，`operator_employee_ids` 為預設
 * 隨車老師（可多位）。
 */
export const createBusRoute = (
  payload: ApiBody<'/bus/routes', 'post'>,
): AxiosResp<'/bus/routes', 'post'> => api.post('/bus/routes', payload)

/**
 * 部分更新班次（`PATCH /bus/routes/{id}`，`BUS_WRITE`）。欄位皆選填但至少要帶一項；
 * `is_active: false` 若該班次目前有進行中班次會 409。**沒有 `direction`**：方向唯讀。
 */
export const updateBusRoute = (
  routeId: number,
  payload: ApiBody<'/bus/routes/{route_id}', 'patch'>,
): AxiosResp<'/bus/routes/{route_id}', 'patch'> => api.patch(`/bus/routes/${routeId}`, payload)

/**
 * 班次排序批次調整（`PATCH /bus/routes/reorder`，`BUS_WRITE`），回整份班次清單。
 *
 * ⚠ 後端此端點必須註冊在 `PATCH /bus/routes/{route_id}` 之前，否則 Starlette 會把
 * `reorder` 當成 route_id 而回 422——若這支打不通先確認後端註冊順序。
 */
export const reorderBusRoutes = (
  items: ApiBody<'/bus/routes/reorder', 'patch'>,
): AxiosResp<'/bus/routes/reorder', 'patch'> => api.patch('/bus/routes/reorder', items)

/**
 * 整條班次名單 replace-all（`PUT /bus/routes/{id}/stops`，`BUS_WRITE`）。
 *
 * ⚠ 契約破壞：`direction` 參數已移除，replace-all 範圍從「路線×方向」變成**整條班次**；
 * `stops[]` 擴 `ride_days`（bitmask，bit0=週一…bit4=週五）／`pinned`／
 * `pickup_address_id`（null＝住家地址）。
 *
 * 422 兩種：跨班次重複（同方向且 ride_days 有交集，整批列出衝突學生與班次）、
 * capacity 超載（逐星期各自計該日搭車站數 max ≤ capacity，訊息指出超載星期）。
 */
export const replaceBusRouteStops = (
  routeId: number,
  stops: ApiBody<'/bus/routes/{route_id}/stops', 'put'>['stops'],
): AxiosResp<'/bus/routes/{route_id}/stops', 'put'> =>
  api.put(`/bus/routes/${routeId}/stops`, { stops })

/**
 * 帶入其他班次名單（`POST /bus/routes/{id}/copy-from`，`BUS_WRITE`）。
 * 複製來源班次的 `ride_days`／`pinned`／`pickup_address_id` 全欄位；`reverse` 預設
 * true（早上最後接的下午最先送）。
 *
 * `preview: true` 只回清單不落庫，衝突學生逐筆帶 `conflict`／`conflict_route_name`
 * 供預覽標示；`preview: false` 儲存時衝突整批 422（capacity 超載同理——預覽仍回清單，
 * 只有儲存才擋）。
 */
export const copyBusRouteFrom = (
  routeId: number,
  payload: ApiBody<'/bus/routes/{route_id}/copy-from', 'post'>,
): AxiosResp<'/bus/routes/{route_id}/copy-from', 'post'> =>
  api.post(`/bus/routes/${routeId}/copy-from`, payload)

/**
 * 自動排序（`POST /bus/routes/{id}/optimize`，`BUS_WRITE`）。
 * `apply` 預設 false＝**只回預覽不落庫**（供 `BusOptimizePreviewDialog` 呈現新舊 diff）；
 * `apply: true` 直接落庫。釘選站固定順位，只重排未釘選的站，
 * `moved_unpinned_student_ids` 標示被移動者。
 */
export const optimizeBusRoute = (
  routeId: number,
  payload: ApiBody<'/bus/routes/{route_id}/optimize', 'post'> = { apply: false },
): AxiosResp<'/bus/routes/{route_id}/optimize', 'post'> =>
  api.post(`/bus/routes/${routeId}/optimize`, payload)

/**
 * 順序固定重算 ETA（`POST /bus/routes/{id}/recompute-etas`，`BUS_WRITE`）：不動順序，
 * 只依現有 seq 重算 `eta_planned` 與 `end_time_planned`。手動拖拉調整順序後用這支。
 */
export const recomputeBusRouteEtas = (
  routeId: number,
): AxiosResp<'/bus/routes/{route_id}/recompute-etas', 'post'> =>
  api.post(`/bus/routes/${routeId}/recompute-etas`)

/**
 * 單一學生地理編碼（`POST /bus/routes/geocode`，`BUS_WRITE`）：依 `students.address`
 * 查座標、**不落庫**（隨名單／當日站點一起存）。
 *
 * 地址簿上線後，地址簿各筆的座標由後端建立時即 geocode；**住家**虛擬項後端恆不帶
 * 座標，由 `BusPickupAddressSelect` 載入後呼叫此端點補上（2026-09-02 起），另供
 * 班次設定頁「重新定位」住家站使用。
 */
export const geocodeBusStudent = (studentId: number) =>
  api.post('/bus/routes/geocode', { student_id: studentId })

// --- Admin：學生接送地址簿（`BUS_WRITE`，三支端點皆從嚴） ---

/**
 * 學生接送地址選單（`GET /bus/students/{id}/pickup-addresses`）。
 *
 * ⚠ 第一項固定是「住家」虛擬項（`id: null`／`is_home: true`／address＝
 * `students.address`），**`pickup_address_id = null` 的語意是「住家地址」而非
 * 「無地址」**——選單不可把它當空值處理。
 */
export const listStudentPickupAddresses = (
  studentId: number,
): AxiosResp<'/bus/students/{student_id}/pickup-addresses', 'get'> =>
  api.get(`/bus/students/${studentId}/pickup-addresses`)

/**
 * 新增接送地址（`POST /bus/students/{id}/pickup-addresses`，201）。
 * 後端建立時即 geocode，失敗不擋建立（`lat`/`lng` 為 null，可後補）。
 */
export const createStudentPickupAddress = (
  studentId: number,
  payload: ApiBody<'/bus/students/{student_id}/pickup-addresses', 'post'>,
): AxiosResp<'/bus/students/{student_id}/pickup-addresses', 'post'> =>
  api.post(`/bus/students/${studentId}/pickup-addresses`, payload)

/**
 * 編輯接送地址（`PATCH …/{address_id}`）。
 * 地址文字有異動才重新 geocode（只改 label 不必白打一次外部 API）；geocode
 * 失敗時 `lat`/`lng` 回 null，語意比照新增——可後補，不代表編輯失敗。
 */
export const updateStudentPickupAddress = (
  studentId: number,
  addressId: number,
  payload: ApiBody<'/bus/students/{student_id}/pickup-addresses/{address_id}', 'patch'>,
): AxiosResp<'/bus/students/{student_id}/pickup-addresses/{address_id}', 'patch'> =>
  api.patch(`/bus/students/${studentId}/pickup-addresses/${addressId}`, payload)

/**
 * 重新定位（`POST …/{address_id}/relocate`）：地址文字不變，無條件重跑一次
 * geocode。跟 `updateStudentPickupAddress` 的差異是後者只在文字**有改**才重查；
 * 這支端點文字沒改也重查，供「尚未定位」或懷疑座標不準時手動重試。
 */
export const relocateStudentPickupAddress = (
  studentId: number,
  addressId: number,
): AxiosResp<'/bus/students/{student_id}/pickup-addresses/{address_id}/relocate', 'post'> =>
  api.post(`/bus/students/${studentId}/pickup-addresses/${addressId}/relocate`)

/**
 * 刪除接送地址（`DELETE …/{address_id}`，204 無 body）。
 * 被任何 `pickup_address_id`（班次名單或未完成當日站點）引用中的地址禁刪，
 * 422 訊息列出引用班次——呼叫端直接呈現後端訊息，不自行推測。
 */
export const deleteStudentPickupAddress = (studentId: number, addressId: number) =>
  api.delete(`/bus/students/${studentId}/pickup-addresses/${addressId}`)

// --- Admin：當日調度（daily-plans） ---

/**
 * 當日計畫（`GET /bus/daily-plans`，`BUS_READ`）：懶生成＋冪等，`date` 省略＝今天，
 * 範圍今天~+7 天（超出 422）。回應逐班次帶 `calendar_warnings`（假日／補班／停課，
 * **警示不阻擋**）、`capacity`、`eta_may_be_stale`。
 *
 * `eta_may_be_stale: true` 時（`depart_time_planned` 被改或有 excused 站）呼叫端要
 * 顯示「ETA 可能已過期，請按重算」，不可默默顯示可能失真的 ETA。
 */
export const getBusDailyPlan = (
  params: ApiQuery<'/bus/daily-plans', 'get'> = {},
): AxiosResp<'/bus/daily-plans', 'get'> => api.get('/bus/daily-plans', { params })

/**
 * 當日名單編輯（`PATCH /bus/daily-plans/{trip_id}/stops`）：單一 body 表達
 * `inserts`／`removes`／`excuse`／`unexcuse`／`address_changes`／`reorder`。
 *
 * ⚠ `in_progress` 班次只開放 `inserts`／`excuse`／`unexcuse`／`reorder`，
 * `removes`／`address_changes` 一律 422——呼叫端在 in_progress 狀態要先隱藏／disable
 * 這兩個動作，不要等後端回 422 才處理。
 */
export const patchBusDailyPlanStops = (
  tripId: number,
  payload: ApiBody<'/bus/daily-plans/{trip_id}/stops', 'patch'>,
): AxiosResp<'/bus/daily-plans/{trip_id}/stops', 'patch'> =>
  api.patch(`/bus/daily-plans/${tripId}/stops`, payload)

/**
 * 當日計畫自動排序（`POST /bus/daily-plans/{trip_id}/optimize`）：只對 pending 站
 * 最佳化（已 departed 的站不動）。`apply` 預設 false＝預覽不落庫。
 */
export const optimizeBusDailyPlan = (
  tripId: number,
  payload: ApiBody<'/bus/daily-plans/{trip_id}/optimize', 'post'> = { apply: false },
): AxiosResp<'/bus/daily-plans/{trip_id}/optimize', 'post'> =>
  api.post(`/bus/daily-plans/${tripId}/optimize`, payload)

/**
 * 重設當日計畫（`POST /bus/daily-plans/{trip_id}/reset`）：丟棄當日編輯，依班次預設
 * 名單＋當日三重過濾重新產生。in_progress 班次只重設 pending 段。
 */
export const resetBusDailyPlan = (
  tripId: number,
): AxiosResp<'/bus/daily-plans/{trip_id}/reset', 'post'> =>
  api.post(`/bus/daily-plans/${tripId}/reset`)

// --- Admin：娃娃車設定（system_configs 四個 `bus.*` key） ---

/** 讀娃娃車設定（`GET /bus/settings`，`BUS_READ`）：園所座標／地址與車輛數。 */
export const getBusSettings = (): AxiosResp<'/bus/settings', 'get'> => api.get('/bus/settings')

/**
 * 寫娃娃車設定（`PUT /bus/settings`，`BUS_WRITE`）。部分更新：未帶的欄位不動，
 * **顯式帶 null 才是清除**。`geocode: true` 時後端依 `school_address` 重算座標。
 */
export const putBusSettings = (
  payload: ApiBody<'/bus/settings', 'put'>,
): AxiosResp<'/bus/settings', 'put'> => api.put('/bus/settings', payload)

// --- Admin：監看與歷史 ---

export const getBusTripToday = (routeId?: number | null) =>
  api.get('/bus/trips/today', { params: routeId ? { route_id: routeId } : {} })

/**
 * 乘車歷史清單（`GET /bus/trips`，`BUS_READ`）。列表**不含座標**，排序固定
 * （後端以 `coalesce(started_at, created_at)` 為鍵，前端不重排）。
 * `page`/`page_size` 皆選填，交給後端預設（1 / 20）；其餘過濾維度未帶時省略
 * 該 query key，交由 axios 預設序列化行為丟棄 undefined。
 *
 * ⚠ 預設**排除** `planned`／`expired`（懶生成上線後每天都會有 planned 班次，歷史頁
 * 不該混入未發車的計畫）；需要含它們時顯式帶 `include_planned: true`。
 */
export const listBusTrips = (
  params: ApiQuery<'/bus/trips', 'get'>,
): AxiosResp<'/bus/trips', 'get'> => api.get('/bus/trips', { params })

/**
 * 單筆班次詳情（`GET /bus/trips/{id}`，`BUS_READ`），含 `stops`（逐站 lat/lng）。
 * ⚠ 隱私：`stops[].lat/lng` 是接送地址座標，呼叫端不得印出數字、寫進 console／URL query。
 */
export const getBusTrip = (tripId: number): AxiosResp<'/bus/trips/{trip_id}', 'get'> =>
  api.get(`/bus/trips/${tripId}`)
