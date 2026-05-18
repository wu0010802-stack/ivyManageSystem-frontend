import api from './index'

// 才藝老師薪資明細（每月每老師可多筆：科目/班級/時數/鐘點/超額/加給）

export const listArtPayroll = (year: number, month: number, employeeId?: number) => {
  const params: Record<string, unknown> = { year, month }
  if (employeeId != null) params.employee_id = employeeId
  return api.get('/art-teacher-payroll', { params })
}

export const createArtPayroll = (payload: unknown) =>
  api.post('/art-teacher-payroll', payload)

export const updateArtPayroll = (id: number, payload: unknown) =>
  api.put(`/art-teacher-payroll/${id}`, payload)

export const deleteArtPayroll = (id: number) =>
  api.delete(`/art-teacher-payroll/${id}`)

// 批次匯入：上傳 .xlsx，回傳 {total, imported, skipped, errors}
export const batchImportArtPayroll = (year: number, month: number, file: File, replaceExisting = false) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(
    `/art-teacher-payroll/batch-import?year=${year}&month=${month}&replace_existing=${replaceExisting}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}
