/**
 * 課堂觀察 / 成長紀錄 API（對應 api/portfolio/observations.py）。
 *
 * 後端路由設計為按 student_id 為前綴：
 *   GET    /api/students/{sid}/observations
 *   POST   /api/students/{sid}/observations
 *   PATCH  /api/students/{sid}/observations/{obs_id}
 *   DELETE /api/students/{sid}/observations/{obs_id}
 */
import api from './index'

export function listObservations(studentId: number, params: unknown = {}) {
  return api.get(`/students/${studentId}/observations`, { params })
}

export function createObservation(studentId: number, payload: unknown) {
  return api.post(`/students/${studentId}/observations`, payload)
}

export function updateObservation(studentId: number, observationId: number, payload: unknown) {
  return api.patch(`/students/${studentId}/observations/${observationId}`, payload)
}

export function deleteObservation(studentId: number, observationId: number) {
  return api.delete(`/students/${studentId}/observations/${observationId}`)
}
