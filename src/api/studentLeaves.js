import api from './index'

// 學生請假紀錄（家長申請；後端 /api/student-leaves，唯讀）
export const listStudentLeaves = (params = {}) =>
  api.get('/student-leaves', { params })
