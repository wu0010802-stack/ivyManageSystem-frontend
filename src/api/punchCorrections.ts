import api from './index'
import type { Schema } from './_generated/typed'
import { fetchPagedList, type PagedResult } from './_pagination'

export type PunchCorrectionListItem = Schema<'PunchCorrectionListItemOut'>

/**
 * 查詢補打卡申請（伺服器分頁）。回傳 PagedResult，取 `.items` 而非 `.data`。
 * 見 `src/api/_pagination.ts` 的契約說明。
 */
export const getCorrections = (
  params: Record<string, unknown> = {},
): Promise<PagedResult<PunchCorrectionListItem>> =>
  fetchPagedList<PunchCorrectionListItem>('/punch-corrections', params)

// payload: { approved: boolean, rejection_reason?: string }
export const approveCorrection = (id: number, payload: unknown) =>
  api.put(`/punch-corrections/${id}/approve`, payload)

// 批次審核
export const batchApproveCorrections = (ids: number[], approved: boolean, rejection_reason: string) =>
  api.post('/punch-corrections/batch-approve', { ids, approved, rejection_reason })
