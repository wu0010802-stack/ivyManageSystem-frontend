import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

/** 列出與期間重疊的月底出勤確認輪次。 */
export const listConfirmationRounds = (
  params: ApiQuery<'/attendance/confirmation-rounds', 'get'>,
): AxiosResp<'/attendance/confirmation-rounds', 'get'> =>
  api.get('/attendance/confirmation-rounds', { params })

/** 發給老師確認；dry_run=true 只回預計項目。 */
export const createConfirmationRound = (
  body: ApiBody<'/attendance/confirmation-rounds', 'post'>,
): AxiosResp<'/attendance/confirmation-rounds', 'post'> =>
  api.post('/attendance/confirmation-rounds', body)

/** 輪次進度與全部項目。 */
export const getConfirmationRound = (
  roundId: number,
): AxiosResp<'/attendance/confirmation-rounds/{round_id}', 'get'> =>
  api.get(`/attendance/confirmation-rounds/${roundId}`)

/** 重新推測（重新匯入打卡或班表變動後）。 */
export const refreshConfirmationRound = (
  roundId: number,
): AxiosResp<'/attendance/confirmation-rounds/{round_id}/refresh', 'post'> =>
  api.post(`/attendance/confirmation-rounds/${roundId}/refresh`)

/** 套用雙方已確認的調班；dry_run=true 只回預計套用清單。 */
export const applyAgreedConfirmations = (
  body: ApiBody<'/attendance/confirmation-items/apply-agreed', 'post'>,
): AxiosResp<'/attendance/confirmation-items/apply-agreed', 'post'> =>
  api.post('/attendance/confirmation-items/apply-agreed', body)

/** 改回覆期限；只改 deadline_date，不改期間（期間發錯請關閉後重發）。 */
export const updateConfirmationRound = (
  roundId: number,
  body: ApiBody<'/attendance/confirmation-rounds/{round_id}', 'patch'>,
): AxiosResp<'/attendance/confirmation-rounds/{round_id}', 'patch'> =>
  api.patch(`/attendance/confirmation-rounds/${roundId}`, body)

/** 關閉輪次：本輪未完成的項目一律失效，關閉後同期間可重新發送。 */
export const closeConfirmationRound = (
  roundId: number,
): AxiosResp<'/attendance/confirmation-rounds/{round_id}/close', 'post'> =>
  api.post(`/attendance/confirmation-rounds/${roundId}/close`)

/** 行政結案：不套用此項目、不再列為待回覆或待處理（已送出的假單／補卡不受影響）。 */
export const dismissConfirmationItem = (
  itemId: number,
  body: ApiBody<'/attendance/confirmation-items/{item_id}/dismiss', 'post'>,
): AxiosResp<'/attendance/confirmation-items/{item_id}/dismiss', 'post'> =>
  api.post(`/attendance/confirmation-items/${itemId}/dismiss`, body)
