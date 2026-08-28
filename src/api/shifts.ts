import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// ── 班別模板 ────────────────────────────────────────────────────────────────

export const getShiftTypes = (
  params?: ApiQuery<'/shifts/types', 'get'>
): AxiosResp<'/shifts/types', 'get'> => api.get('/shifts/types', { params })

export const createShiftType = (
  data: ApiBody<'/shifts/types', 'post'>
): AxiosResp<'/shifts/types', 'post'> => api.post('/shifts/types', data)

export const updateShiftType = (
  id: number,
  data: ApiBody<'/shifts/types/{type_id}', 'put'>
): AxiosResp<'/shifts/types/{type_id}', 'put'> => api.put(`/shifts/types/${id}`, data)

export const deleteShiftType = (
  id: number
): AxiosResp<'/shifts/types/{type_id}', 'delete'> => api.delete(`/shifts/types/${id}`)

// ── 排班名冊 ────────────────────────────────────────────────────────────────
// 排班專用最小欄位名冊（SCHEDULE 權限即可）。勿改回 GET /employees：那需要
// EMPLOYEES_READ 且全量 EmployeeOut 含 PII，列表端點也不填 classroom_name。

export const getScheduleRoster = (
  params?: ApiQuery<'/shifts/roster', 'get'>
): AxiosResp<'/shifts/roster', 'get'> => api.get('/shifts/roster', { params })

// ── 每週排班 ────────────────────────────────────────────────────────────────

export const getAssignments = (
  params: ApiQuery<'/shifts/assignments', 'get'>
): AxiosResp<'/shifts/assignments', 'get'> => api.get('/shifts/assignments', { params })

export const saveAssignments = (
  data: ApiBody<'/shifts/assignments', 'post'>
): AxiosResp<'/shifts/assignments', 'post'> => api.post('/shifts/assignments', data)

/** 整月複製（後端單一 transaction；dry_run=true 先取預覽） */
export const copyMonthAssignments = (
  data: ApiBody<'/shifts/copy-month', 'post'>
): AxiosResp<'/shifts/copy-month', 'post'> => api.post('/shifts/copy-month', data)

// ── 每日排班（三態：指定班別／day_off 明確排休／刪列恢復繼承） ─────────────

export const getDaily = (
  params: ApiQuery<'/shifts/daily', 'get'>
): AxiosResp<'/shifts/daily', 'get'> => api.get('/shifts/daily', { params })

export const saveDaily = (
  data: ApiBody<'/shifts/daily', 'post'>
): AxiosResp<'/shifts/daily', 'post'> => api.post('/shifts/daily', data)

export const deleteDaily = (
  id: number
): AxiosResp<'/shifts/daily/{shift_id}', 'delete'> => api.delete(`/shifts/daily/${id}`)

// ── 排班頁請假摘要 ──────────────────────────────────────────────────────────
// SCHEDULE 權限即可（勿改走 GET /leaves：那需要 LEAVES_READ 且含 reason 等
// 完整假單資訊；排班只需要「誰、哪個時段不在」的白名單 10 欄）。

export const getLeaveContext = (
  params: ApiQuery<'/shifts/leave-context', 'get'>
): AxiosResp<'/shifts/leave-context', 'get'> => api.get('/shifts/leave-context', { params })

// ── 換班歷史（管理端） ──────────────────────────────────────────────────────

export const getSwapHistory = (
  params?: ApiQuery<'/shifts/swap-history', 'get'>
): AxiosResp<'/shifts/swap-history', 'get'> =>
  api.get('/shifts/swap-history', { params })

// ── 排班 Excel 匯入/匯出（blob 端點無 JSON schema，維持 untyped） ──────────

export const getShiftImportTemplate = () =>
  api.get('/shifts/import-template', { responseType: 'blob' })

/** 回傳 ShiftImportResultOut——成功筆數欄位名是 `saved`（不是 upserted） */
export const importShifts = (
  formData: FormData,
  weekStart: string
): AxiosResp<'/shifts/import', 'post'> =>
  api.post(`/shifts/import?week_start=${weekStart}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const exportShifts = (weekStart: string) =>
  api.get('/exports/shifts', { params: { week_start: weekStart }, responseType: 'blob' })
