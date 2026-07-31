import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

export const getStudents = (
  params: ApiQuery<'/students', 'get'> = {},
): AxiosResp<'/students', 'get'> => api.get('/students', { params })

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

// 重複建檔查重（架構評估 D4，2026-07-11）：同名同生日既有「非終態」學生會回 409
// （detail 純文字，含既有學生 id/班級/lifecycle_status）。可帶 allow_duplicate:true
// 覆寫，見 src/utils/studentDuplicateConflict.ts 的確認流程包裝。
export const createStudent = (data: Record<string, unknown>): AxiosResp<'/students', 'post'> =>
  api.post('/students', data)

export const updateStudent = (id: number, data: unknown) => api.put(`/students/${id}`, data)

export const graduateStudent = (id: number, data: unknown) => api.post(`/students/${id}/graduate`, data)

export const bulkTransferStudents = (data: unknown) => api.post('/students/bulk-transfer', data)

// 批次畢業/轉出（整班學年末一次處理）；新端點，push 前 gen:api 補 schema.d.ts
export const bulkGraduateStudents = (data: unknown) => api.post('/students/bulk-graduate', data)

export const previewBonusImpact = (data: unknown) => api.post('/bonus-impact-preview', data)

// ============ 學生生命週期追蹤（Phase A） ============

// 聚合檔案：basic + lifecycle + health + guardians + summaries + timeline
export const getStudentProfile = (
  id: number,
  params: ApiQuery<'/students/{student_id}/profile', 'get'> = {},
): AxiosResp<'/students/{student_id}/profile', 'get'> =>
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

// 簽發無 LINE / 換裝置家長的裝置設定碼（明碼僅回一次；跟綁定碼是兩支獨立
// 端點與資料表，用途不同：綁定碼給已有 LINE 的家長綁小孩，設定碼給沒有
// LINE 或換新手機的家長直接兌換登入 session）
export const createGuardianDeviceSetupCode = (guardianId: number) =>
  api.post(`/guardians/${guardianId}/device-setup-code`)

// 撤銷此監護人對應家長帳號的所有裝置（含 LINE 裝置一併撤銷）；回傳
// { revoked: <撤銷的 session 數量> }，該家長帳號沒有 user_id（從未登入過）
// 時後端回 revoked:0，不是錯誤。
export const revokeGuardianDevices = (guardianId: number) =>
  api.post(`/guardians/${guardianId}/revoke-devices`)
