/**
 * 學生個案彙總 API（對應 api/portal/students.py 的 /{id}/detail）。
 */
import api from './index'

export function getStudentDetail(studentId) {
  return api.get(`/portal/students/${studentId}/detail`)
}
