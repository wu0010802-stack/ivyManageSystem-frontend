/**
 * 家長端娃娃車 API。
 *
 * 對應後端 `api/parent_portal/bus.py`（prefix `/api/parent`）。
 * 回傳形狀為 `BusTodayOut`：`{ trip, position, stale, school, children }`，
 * 無班次或非搭車家庭時五個欄位一律為空值（後端刻意不揭露班次是否存在）。
 *
 * 型別：後端已掛 `response_model=`，待 `npm run gen:api` 產出 bus 路徑後應改用
 * `AxiosResp<'/parent/bus/today', 'get'>`；目前 `src/api/_generated/schema.d.ts`
 * 尚未包含 bus 端點，故暫由 useBusTracking 端以本地型別 narrow。
 */
import api from './index'

export const getBusToday = () => api.get('/parent/bus/today')
