import api from './index'

export const fetchChildPhotos = (studentId, params = {}) =>
  api.get('/parent/photos', { params: { student_id: studentId, ...params } })
