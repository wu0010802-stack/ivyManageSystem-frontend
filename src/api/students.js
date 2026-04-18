import api from './index'

export const getStudents = (params) => api.get('/students', { params })

export const createStudent = (data) => api.post('/students', data)

export const updateStudent = (id, data) => api.put(`/students/${id}`, data)

export const graduateStudent = (id, data) => api.post(`/students/${id}/graduate`, data)

export const bulkTransferStudents = (data) => api.post('/students/bulk-transfer', data)

export const previewBonusImpact = (data) => api.post('/bonus-impact-preview', data)

// ============ 學生生命週期追蹤（Phase A） ============

// 聚合檔案：basic + lifecycle + health + guardians + summaries + timeline
export const getStudentProfile = (id, params = {}) =>
  api.get(`/students/${id}/profile`, { params })

// 生命週期狀態轉移（退學/休學/畢業/轉出/復學等）
// body: { to_status, effective_date?, reason?, notes? }
export const transitionStudentLifecycle = (id, data) =>
  api.post(`/students/${id}/lifecycle`, data)

// ============ 監護人 CRUD ============
export const listGuardians = (studentId) =>
  api.get(`/students/${studentId}/guardians`)

export const createGuardian = (studentId, data) =>
  api.post(`/students/${studentId}/guardians`, data)

export const updateGuardian = (guardianId, data) =>
  api.patch(`/students/guardians/${guardianId}`, data)

export const deleteGuardian = (guardianId) =>
  api.delete(`/students/guardians/${guardianId}`)
