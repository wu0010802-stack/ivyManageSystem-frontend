import api from './index'

/**
 * 取得單一子女最近 N 筆 timeline（攤平的 attendance/announcement/...）。
 * @param {number} studentId
 * @param {{ limit?: number }} opts
 */
export const getFamilyTimeline = (studentId: number, { limit = 7 }: { limit?: number } = {}) =>
  api.get('/parent/family/timeline', { params: { student_id: studentId, limit } })
