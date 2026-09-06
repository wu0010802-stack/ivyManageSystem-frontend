import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

/** 核對已匯入打卡與當日班表；不修改出勤或班表。 */
export const previewReconciliation = (
  body: ApiBody<'/attendance/reconciliation/preview', 'post'>,
): AxiosResp<'/attendance/reconciliation/preview', 'post'> =>
  api.post('/attendance/reconciliation/preview', body)

/** 以核對版本確認一至兩人的當日班別，並連動重算。 */
export const confirmReconciliationShift = (
  body: ApiBody<'/attendance/reconciliation/confirm-shift', 'post'>,
): AxiosResp<'/attendance/reconciliation/confirm-shift', 'post'> =>
  api.post('/attendance/reconciliation/confirm-shift', body)
