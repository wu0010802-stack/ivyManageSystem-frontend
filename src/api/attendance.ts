import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// ── 匯入 ─────────────────────────────────────────────────────────────────────

/** Excel 直接匯入（legacy 相容路徑；新格式請改走 previewExcel → uploadCsv 兩段式） */
export const uploadFile = (formData: FormData): AxiosResp<'/attendance/upload', 'post'> =>
  api.post('/attendance/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const uploadCsv = (
  payload: ApiBody<'/attendance/upload-csv', 'post'>,
): AxiosResp<'/attendance/upload-csv', 'post'> => api.post('/attendance/upload-csv', payload)

export const previewImport = (
  payload: ApiBody<'/attendance/upload/preview', 'post'>,
): AxiosResp<'/attendance/upload/preview', 'post'> =>
  api.post('/attendance/upload/preview', payload)

/** 新格式 Excel 逐列預覽（唯讀；confirm 走 uploadCsv） */
export const previewExcel = (
  formData: FormData,
  params?: ApiQuery<'/attendance/upload/preview-excel', 'post'>,
): AxiosResp<'/attendance/upload/preview-excel', 'post'> =>
  api.post('/attendance/upload/preview-excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params,
  })

// ── 查詢 ─────────────────────────────────────────────────────────────────────

export const getRecords = (
  params: ApiQuery<'/attendance/records', 'get'>,
): AxiosResp<'/attendance/records', 'get'> => api.get('/attendance/records', { params })

export const getSummary = (
  params: ApiQuery<'/attendance/summary', 'get'>,
): AxiosResp<'/attendance/summary', 'get'> => api.get('/attendance/summary', { params })

export const getToday = (): AxiosResp<'/attendance/today', 'get'> =>
  api.get('/attendance/today')

export const getTodayAnomalies = (): AxiosResp<'/attendance/today-anomalies', 'get'> =>
  api.get('/attendance/today-anomalies')

export const getAnomalyList = (
  params: ApiQuery<'/attendance/anomalies', 'get'>,
): AxiosResp<'/attendance/anomalies', 'get'> => api.get('/attendance/anomalies', { params })

export const getCalendar = (
  params: ApiQuery<'/attendance/calendar', 'get'>,
): AxiosResp<'/attendance/calendar', 'get'> => api.get('/attendance/calendar', { params })

// ── 異常處理 ─────────────────────────────────────────────────────────────────

export const batchConfirmAnomalies = (
  payload: ApiBody<'/attendance/anomalies/batch-confirm', 'post'>,
): AxiosResp<'/attendance/anomalies/batch-confirm', 'post'> =>
  api.post('/attendance/anomalies/batch-confirm', payload)

export const exportAnomalies = (year: number, month: number, status = 'all') =>
  api.get('/attendance/anomalies/export', { params: { year, month, status }, responseType: 'blob' })

export const exportEmployeeAttendance = (params: ApiQuery<'/exports/employee-attendance', 'get'>) =>
  api.get('/exports/employee-attendance', { params, responseType: 'blob' })

// ── 單筆維護 ─────────────────────────────────────────────────────────────────

export const upsertRecord = (
  data: ApiBody<'/attendance/record', 'post'>,
): AxiosResp<'/attendance/record', 'post'> => api.post('/attendance/record', data)

// 刪除整月份考勤（path 用 /records/month/... 避免與單筆刪除路由遮蔽，見後端 P1-6）
export const deleteMonthRecords = (
  year: number,
  month: number,
): AxiosResp<'/attendance/records/month/{year}/{month}', 'delete'> =>
  api.delete(`/attendance/records/month/${year}/${month}`)

// 刪除特定員工某日考勤
export const deleteEmployeeDateRecord = (
  employeeId: number,
  date: string,
): AxiosResp<'/attendance/records/{employee_id}/{date_str}', 'delete'> =>
  api.delete(`/attendance/records/${employeeId}/${date}`)
