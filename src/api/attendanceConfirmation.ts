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
