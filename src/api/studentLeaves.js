import api from './index'

// 學生請假審核（家長申請；後端 /api/student-leaves，需 STUDENTS_READ/WRITE）
export const listStudentLeaves = (params = {}) =>
  api.get('/student-leaves', { params })

export const approveStudentLeave = (id, payload = {}) =>
  api.post(`/student-leaves/${id}/approve`, payload)

export const rejectStudentLeave = (id, payload = {}) =>
  api.post(`/student-leaves/${id}/reject`, payload)
