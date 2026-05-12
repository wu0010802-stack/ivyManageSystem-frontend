import api from './index'

export const fetchChildTimeline = (studentId, params = {}) =>
  api.get('/parent/timeline', { params: { student_id: studentId, ...params } })
