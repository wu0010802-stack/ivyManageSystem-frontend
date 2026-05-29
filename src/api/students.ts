import api from './index'

export const getStudents = (params: unknown) => api.get('/students', { params })

export const getStudent = (id: number) => api.get(`/students/${id}`)

// P0d-2 法規/個資 §6 特種個資 reason-gated 醫療欄位讀取。
// 每次 call 後端寫 medical_access_log。reason 後端強制 ≥10 字 ≤500 字 + STUDENTS_HEALTH_READ。
export interface MedicalFieldsOut {
  student_id: number
  name: string
  allergy: string | null
  medication: string | null
  special_needs: string | null
}

export const getStudentMedical = (id: number, reason: string) =>
  api.get<MedicalFieldsOut>(`/students/${id}/medical`, { params: { reason } })

export const createStudent = (data: unknown) => api.post('/students', data)

export const updateStudent = (id: number, data: unknown) => api.put(`/students/${id}`, data)

export const graduateStudent = (id: number, data: unknown) => api.post(`/students/${id}/graduate`, data)

export const bulkTransferStudents = (data: unknown) => api.post('/students/bulk-transfer', data)

export const previewBonusImpact = (data: unknown) => api.post('/bonus-impact-preview', data)

// ============ 學生生命週期追蹤（Phase A） ============

// 聚合檔案：basic + lifecycle + health + guardians + summaries + timeline
export const getStudentProfile = (id: number, params: unknown = {}) =>
  api.get(`/students/${id}/profile`, { params })

// 生命週期狀態轉移（退學/休學/畢業/轉出/復學等）
// body: { to_status, effective_date?, reason?, notes? }
export const transitionStudentLifecycle = (id: number, data: unknown) =>
  api.post(`/students/${id}/lifecycle`, data)

// ============ 監護人 CRUD ============
export const listGuardians = (studentId: number) =>
  api.get(`/students/${studentId}/guardians`)

export const createGuardian = (studentId: number, data: unknown) =>
  api.post(`/students/${studentId}/guardians`, data)

export const updateGuardian = (guardianId: number, data: unknown) =>
  api.patch(`/students/guardians/${guardianId}`, data)

export const deleteGuardian = (guardianId: number) =>
  api.delete(`/students/guardians/${guardianId}`)

// 簽發家長 LINE LIFF 綁定碼（明碼僅回一次；後端 sha256 存 hash）
export const createGuardianBindingCode = (guardianId: number) =>
  api.post(`/guardians/${guardianId}/binding-code`)
