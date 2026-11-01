import api from './index'
import { errorDetailObject } from '@/utils/errorMessages'

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
// 該月已有明細時須明確選擇 replaceExisting（覆寫整月）或 append（追加），
// 否則後端回 409 detail.code=ART_IMPORT_MONTH_HAS_ENTRIES（BONUS-F7，防重傳加倍）。
export const ART_IMPORT_MONTH_HAS_ENTRIES = 'ART_IMPORT_MONTH_HAS_ENTRIES'

export const batchImportArtPayroll = (
  year: number,
  month: number,
  file: File,
  replaceExisting = false,
  append = false,
) => {
  const formData = new FormData()
  formData.append('file', file)
  const appendQuery = append ? '&append=true' : ''
  return api.post(
    `/art-teacher-payroll/batch-import?year=${year}&month=${month}&replace_existing=${replaceExisting}${appendQuery}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

/** 若錯誤為「該月已有明細需選擇覆寫或追加」的 409，回傳既有筆數；否則 null。 */
export const artImportExistingCount = (err: unknown): number | null => {
  if ((err as { response?: { status?: number } } | null)?.response?.status !== 409) return null
  const detail = errorDetailObject<{ existing_count?: unknown }>(err)
  if (!detail) return null
  const { code, existing_count: count } = detail
  if (code !== ART_IMPORT_MONTH_HAS_ENTRIES) return null
  return typeof count === 'number' ? count : 0
}
