import api from './index'

export const fetchChildTimeline = (studentId: number, params: unknown = {}) =>
  api.get('/parent/timeline', { params: { student_id: studentId, ...(params as object) } })
