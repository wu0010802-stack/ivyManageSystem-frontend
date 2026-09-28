import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

/** 本人為當事人或對象的月底出勤確認項目＋本月簽認狀態。 */
export const getMyAttendanceConfirmations = (
  params: ApiQuery<'/portal/attendance-confirmations', 'get'>,
): AxiosResp<'/portal/attendance-confirmations', 'get'> =>
  api.get('/portal/attendance-confirmations', { params })

/** 待本人回覆的確認項目數（側欄徽章）。 */
export const getAttendanceConfirmPendingCount = (): AxiosResp<
  '/portal/attendance-confirmations/pending-count',
  'get'
> => api.get('/portal/attendance-confirmations/pending-count')

/** 逐筆回覆：對，或不對並修正。 */
export const respondAttendanceConfirmation = (
  itemId: number,
  body: ApiBody<'/portal/attendance-confirmations/{item_id}/respond', 'post'>,
): AxiosResp<'/portal/attendance-confirmations/{item_id}/respond', 'post'> =>
  api.post(`/portal/attendance-confirmations/${itemId}/respond`, body)

/** 本月出勤確認完成（簽認）。 */
export const signoffAttendanceMonth = (
  body: ApiBody<'/portal/attendance-signoff', 'post'>,
): AxiosResp<'/portal/attendance-signoff', 'post'> => api.post('/portal/attendance-signoff', body)
