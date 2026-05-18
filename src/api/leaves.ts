import api from './index'

export const getLeaves = (params: unknown) => api.get('/leaves', { params })

export const createLeave = (data: unknown) => api.post('/leaves', data)

export const updateLeave = (id: number, data: unknown) => api.put(`/leaves/${id}`, data)

// payload: {
//   approved: boolean,
//   rejection_reason?: string,                  // 駁回時必填
//   force_without_substitute?: boolean,         // 主管警告後仍核准（無代理人）
//   force_overlap?: boolean,                    // 主管警告後仍核准（與其他已核准假單重疊）
//   force_overlap_reason?: string,              // force_overlap=true 時必填 ≥10 字（2026-04-27 守衛）
// }
// 注意：force_overlap=true 時，操作者需具 ACTIVITY_PAYMENT_APPROVE 權限（金流簽核），
//       且 force_overlap_reason ≥10 字，後端會寫進 ApprovalLog 永久稽核軌跡。
export const approveLeave = (id: number, payload: unknown) => api.put(`/leaves/${id}/approve`, payload)

export const getLeaveAttachment = (leaveId: number, filename: string) =>
  api.get(`/leaves/${leaveId}/attachments/${filename}`, { responseType: 'blob' })

export const uploadLeaveAttachments = (leaveId: number, formData: FormData) =>
  api.post(`/leaves/${leaveId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const getLeaveQuotas = (params: unknown) => api.get('/leaves/quotas', { params })

export const updateLeaveQuota = (id: number, data: unknown) => api.put(`/leaves/quotas/${id}`, data)

// null body，透過 query params 送出
export const initLeaveQuotas = (params: unknown) =>
  api.post('/leaves/quotas/init', null, { params })

export const getWorkdayHours = (params: unknown) => api.get('/leaves/workday-hours', { params })

// 批次審核
export const batchApproveLeaves = (ids: number[], approved: boolean, rejection_reason: string) =>
  api.post('/leaves/batch-approve', { ids, approved, rejection_reason })

// Excel 匯入
export const getLeaveImportTemplate = () =>
  api.get('/leaves/import-template', { responseType: 'blob' })

export const importLeaves = (formData: FormData) =>
  api.post('/leaves/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
