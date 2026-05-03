/**
 * 教師端用藥執行 API。
 * - listToday → 對應 api/portal/medications.py（按班級分組）
 * - administer / skip / correct → 對應 api/student_health.py
 */
import api from './index'

export function listToday(params = {}) {
  return api.get('/portal/medications/today', { params })
}

export function administer(logId, payload = {}) {
  return api.post(`/medication-logs/${logId}/administer`, payload)
}

export function skipLog(logId, payload) {
  return api.post(`/medication-logs/${logId}/skip`, payload)
}

export function correctLog(logId, payload) {
  return api.post(`/medication-logs/${logId}/correct`, payload)
}
