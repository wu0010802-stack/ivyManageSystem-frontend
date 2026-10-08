/**
 * 家長端娃娃車 API。
 *
 * 對應後端 `api/parent_portal/bus.py`（prefix `/api/parent`）。
 * 回傳形狀為 `BusTodayOut`：`{ trip, position, stale, school, children }`，
 * 無班次或非搭車家庭時五個欄位一律為空值（後端刻意不揭露班次是否存在）。
 *
 * 型別：後端已掛 `response_model=`，待 `npm run gen:api` 產出 bus 路徑後應改用
 * `AxiosResp<'/parent/bus/today', 'get'>`；目前 `src/api/_generated/schema.d.ts`
 * 的 bus 區塊是 FE-API-01（bus-admin lane）以 bussch06 當時的後端 openapi
 * 產的，**不含本檔的 `GET /parent/bus/ride-cancellations`**（bussch07 之後才有），
 * 故整支檔案維持薄封裝、由呼叫端（useBusTracking／TodayView）本地 narrow，
 * 避免同一支檔案一半用產生型別、一半用手寫型別的分裂狀態。
 * 後端 bussch07 合流後重跑一次 gen:api 即可整支改用產生型別。
 */
import api from './index'

export const getBusToday = () => api.get('/parent/bus/today')

/**
 * 指定日期的「排定搭車方向」與「有效今天不搭申報」（bussch07）。
 *
 * 為什麼 `/today` 不夠：它依 spec「家長端」第 3 點排除 `planned`／`expired`，
 * 無班次時回全空——家長最需要申報不搭的時段（前一晚 ~ 當天發車前）恰好是那個
 * 空窗，光看 `/today` 無從判斷入口該不該出現。本端點與 trip 生命週期無關，
 * 資料來自預設名單，故那個空窗也答得出來。
 *
 * 回應：`{ date, children: [{ student_id, student_name, scheduled_directions,
 * cancellations: [{ id, direction, revocable }] }] }`。既不搭車也無申報的
 * 小孩後端已整筆略過，前端不需再過濾。`revocable=false`＝該站已出發（撤銷
 * 會吃 422），撤銷鈕要事前收掉。
 *
 * `date` 省略＝今天；後端只接受今天起 7 天內（超出回 422）。
 */
export const getRideCancellations = (date?: string) =>
  api.get('/parent/bus/ride-cancellations', { params: date ? { date } : undefined })

/**
 * 申報「今天不搭」。
 *
 * ⚠ 「整天」是**同一個 request 內帶兩個 direction**，不是打兩次 HTTP
 * （後端 `RideCancellationCreateIn.directions` 註解明文）。後端逐 direction
 * 各自跑 savepoint，回 `{ results: [{ direction, success, cancellation_id,
 * message }] }`——早上已接走、下午仍可取消時是**部分成功**，呼叫端必須逐筆
 * 呈現結果，不可用「整批成功/失敗」二分法（spec 資料模型節「整天部分失敗語意」）。
 */
export const createRideCancellation = (payload: {
  student_id: number
  date: string
  directions: Array<'morning' | 'afternoon'>
}) => api.post('/parent/bus/ride-cancellations', payload)

/**
 * 撤銷「今天不搭」；撤銷後可再次申請。
 *
 * 該站已 `departed` 時後端回 422（spec：「該站 departed 前可撤銷」）——正常
 * 情況下呼叫端應已依 `getRideCancellations` 的 `revocable` 收掉按鈕，這裡的
 * 422 是競態（列表拿到後車才開走）的兜底，需呈現錯誤訊息而非靜默。
 */
export const revokeRideCancellation = (cancellationId: number) =>
  api.post(`/parent/bus/ride-cancellations/${cancellationId}/revoke`)
