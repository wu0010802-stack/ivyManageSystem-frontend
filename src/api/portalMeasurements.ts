/**
 * 學生量測（身高/體重/視力/頭圍）教師端 API。
 *
 * 寫入路徑直打 admin endpoint（教師預設角色含 PORTFOLIO_WRITE，
 * 後端 assert_student_access 已驗自己班限定）。
 */
import api from './index'

export function listMeasurements(studentId: number, params: unknown = {}) {
  return api.get(`/students/${studentId}/measurements`, { params })
}

export function createMeasurement(studentId: number, payload: unknown) {
  return api.post(`/students/${studentId}/measurements`, payload)
}

/**
 * 教師端批次預填用：取自己班學生 + 每人上次量測。
 * 後端 /api/portal/students/measurements-latest。
 */
export function getMeasurementsLatest() {
  return api.get('/portal/students/measurements-latest')
}
