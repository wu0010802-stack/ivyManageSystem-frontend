import api from './index'
import type { ApiBody, ApiQuery, AxiosResp, Schema } from './_generated/typed'
import { fetchPagedList, type PagedResult } from './_pagination'

export type OvertimeListItem = Schema<'OvertimeListItemOut'>

/**
 * 查詢加班記錄（伺服器分頁）。回傳 PagedResult，取 `.items` 而非 `.data`。
 * 見 `src/api/_pagination.ts` 的契約說明。
 */
export const getOvertimes = (
  params: Record<string, unknown> = {},
): Promise<PagedResult<OvertimeListItem>> =>
  fetchPagedList<OvertimeListItem>('/overtimes', params)

export type OvertimeTypeSuggestion = Schema<'OvertimeTypeSuggestionOut'>

/**
 * 依日期與員工排班建議加班類型（唯讀；與建立／核准時後端類型驗證同一判定）。
 * `allowed_types` 長度 >1 表示模稜兩可（週末有排班、工作日被排休），只建議不強制。
 */
export const suggestOvertimeType = (
  params: ApiQuery<'/overtimes/suggest-type', 'get'>,
): AxiosResp<'/overtimes/suggest-type', 'get'> => api.get('/overtimes/suggest-type', { params })

export const createOvertime = (data: unknown) => api.post('/overtimes', data)

export const updateOvertime = (id: number, data: unknown) => api.put(`/overtimes/${id}`, data)

// payload: { approved: boolean, rejection_reason?: string }
// 駁回必須帶 rejection_reason（後端要求 trim 後 ≥3 字，2026-05-07 安全強化）
export const approveOvertime = (id: number, payload: unknown) =>
  api.put(`/overtimes/${id}/approve`, payload)

// 批次審核
export const batchApproveOvertimes = (ids: number[], approved: boolean, rejection_reason: string) =>
  api.post('/overtimes/batch-approve', { ids, approved, rejection_reason })

// 批次建立（學校活動多人出席）；後端全部或全無，失敗回 422 detail.errors
export const batchCreateOvertimes = (payload: ApiBody<'/overtimes/batch-create', 'post'>) =>
  api.post('/overtimes/batch-create', payload)

// Excel 匯入
export const getOvertimeImportTemplate = () =>
  api.get('/overtimes/import-template', { responseType: 'blob' })

export const importOvertimes = (formData: FormData) =>
  api.post('/overtimes/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
