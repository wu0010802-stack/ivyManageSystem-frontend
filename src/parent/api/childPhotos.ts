import api from './index'

export const fetchChildPhotos = (studentId: number, params: unknown = {}) =>
  api.get('/parent/photos', { params: { student_id: studentId, ...(params as object) } })
