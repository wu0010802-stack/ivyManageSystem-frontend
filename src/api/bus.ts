/**
 * 娃娃車 API（隨車老師 portal 班次操作 ＋ 管理端路線管理／監看），對應後端 `api/bus/`。
 *
 * 權限分界（後端 `api/bus/portal_trips.py` / `api/bus/admin_routes.py`）：
 * - portal 區塊：`BUS_TRIPS_OPERATE`（per-user 顯式授權，無 role 預設）
 * - admin 區塊：讀 `BUS_READ`、寫 `BUS_WRITE`
 *
 * ⚠ **路線清單有兩支，不可混用**：
 * - `listPortalBusRoutes`（`GET /portal/bus/routes`，`BUS_TRIPS_OPERATE`）只回
 *   `id`/`name`/`is_active`，是**隨車頁唯一該用的那支**。
 * - `listBusRoutes`（`GET /bus/routes`，`BUS_READ`）回全車站點名冊（學生姓名與家庭
 *   座標），僅供管理端。為了讓隨車老師能開班而補授 `BUS_READ` 等於把全園學生住址
 *   一併給出去。
 *
 * 型別：`src/api/_generated/schema.d.ts` 目前尚未涵蓋 `/bus` 與 `/portal/bus` 路徑
 * （codegen 需要後端先 dump openapi.json），故此處不標 `AxiosResp<...>`；呼叫端
 * （usePortalBusTrip）以本地 interface narrow，待 `npm run gen:api` 涵蓋後改為
 * 產生型別。**不得**把後端 schema 手抄成共用型別檔（CLAUDE.md：禁止手寫對應型別）。
 */
import api from './index'

// --- Portal（隨車老師，Permission.BUS_TRIPS_OPERATE） ---

/**
 * 開班前的路線選單：只回啟用中的路線與 `id`/`name`/`is_active`，**不含站點名冊**。
 * 與 `POST /portal/bus/trips` 同權限，隨車老師不需要 `BUS_READ` 就能自行開班。
 */
export const listPortalBusRoutes = () => api.get('/portal/bus/routes')

/** 開始班次；成功 201 回 `{trip, stops}`，已有進行中班次時 409 `{message, trip_id}`。 */
export const startBusTrip = (routeId: number, direction: 'morning' | 'afternoon') =>
  api.post('/portal/bus/trips', { route_id: routeId, direction })

/**
 * 取進行中的班次。三個過濾維度彼此 AND，回傳形狀一律 `{trip, stops}`。
 *
 * ⚠ **一個維度都不帶＝全域查詢**（後端挑最近一筆 in_progress，任何路線、任何操作者），
 * 多路線同時開班就會回到別條路線的完整站點名冊——那是含學生姓名與家庭座標的個資。
 * - 進頁復原用 `mine=true`（後端 `8836ecde`：比對 `BusTrip.operator_employee_id`
 *   與 token 的 employee_id；帳號未綁員工回 **403**，刻意不默默退化成「回任何人的」）。
 * - 已知路線／方向的重新同步（開班 409 接手、站點 409 分岔）用 `route_id`＋`direction`。
 *
 * `mine` 預設 false＝後端改動前的行為，向後相容。
 */
export const getActiveBusTrip = (
  routeId?: number | null,
  direction?: 'morning' | 'afternoon' | null,
  mine = false,
) =>
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

export const departBusStop = (tripId: number, stopId: number) =>
  api.post(`/portal/bus/trips/${tripId}/stops/${stopId}/depart`)

export const skipBusStop = (tripId: number, stopId: number) =>
  api.post(`/portal/bus/trips/${tripId}/stops/${stopId}/skip`)

export const undoBusStop = (tripId: number, stopId: number) =>
  api.post(`/portal/bus/trips/${tripId}/stops/${stopId}/undo`)

export const completeBusTrip = (tripId: number) =>
  api.post(`/portal/bus/trips/${tripId}/complete`)

// --- Admin（路線管理＋監看，Permission.BUS_READ / BUS_WRITE） ---

export const listBusRoutes = () => api.get('/bus/routes')

export const createBusRoute = (name: string) => api.post('/bus/routes', { name })

export const replaceBusRouteStops = (
  routeId: number,
  direction: 'morning' | 'afternoon',
  stops: Array<{ student_id: number; seq: number; lat?: number | null; lng?: number | null }>,
) => api.put(`/bus/routes/${routeId}/stops`, { direction, stops })

export const geocodeBusStudent = (studentId: number) =>
  api.post('/bus/routes/geocode', { student_id: studentId })

/**
 * 改名／啟用停用（`PATCH /bus/routes/{id}`，`BUS_WRITE`）。兩欄皆選填但至少要帶一項；
 * `is_active: false` 若該路線目前有進行中班次會 409。
 */
export const updateBusRoute = (
  routeId: number,
  payload: { name?: string; is_active?: boolean },
) => api.patch(`/bus/routes/${routeId}`, payload)

export const getBusTripToday = (routeId?: number | null) =>
  api.get('/bus/trips/today', { params: routeId ? { route_id: routeId } : {} })
