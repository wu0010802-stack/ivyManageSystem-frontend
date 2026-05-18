/**
 * 教師端用藥執行 API。
 * - listToday → 對應 api/portal/medications.py（按班級分組）
 * - administer / skip / correct → 對應 api/student_health.py
 */
import api from './index'

export function listToday(params: unknown = {}) {
  return api.get('/portal/medications/today', { params })
}

export function administer(logId: number, payload: unknown = {}) {
  return api.post(`/medication-logs/${logId}/administer`, payload)
}

export function skipLog(logId: number, payload: unknown) {
  return api.post(`/medication-logs/${logId}/skip`, payload)
}

export function correctLog(logId: number, payload: unknown) {
  return api.post(`/medication-logs/${logId}/correct`, payload)
}
