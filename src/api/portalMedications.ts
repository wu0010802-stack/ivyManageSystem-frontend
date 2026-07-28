/**
 * 教師端用藥執行 API。
 * - listToday → 對應 api/portal/medications.py（按班級分組）
 * - administer / skip / correct → 對應 api/student_health.py
 */
import type { ApiBody } from './_generated/typed'
import api from './index'

export function listToday(params: unknown = {}) {
  return api.get('/portal/medications/today', { params })
}

export function administer(logId: number, payload: unknown = {}) {
  return api.post(`/medication-logs/${logId}/administer`, payload)
}

// 收緊成 OpenAPI 產生型別：後端 SkipPayload 的欄位是 `skipped_reason`（必填），
// 先前 `payload: unknown` 讓兩個教師端呼叫端誤送 `{ reason }` 而 vue-tsc 抓不到，
// 導致「略過用藥」永遠 422、用藥紀錄卡在 pending。
export function skipLog(
  logId: number,
  payload: ApiBody<'/medication-logs/{log_id}/skip', 'post'>,
) {
  return api.post(`/medication-logs/${logId}/skip`, payload)
}

export function correctLog(logId: number, payload: unknown) {
  return api.post(`/medication-logs/${logId}/correct`, payload)
}
