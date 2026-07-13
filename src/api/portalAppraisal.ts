/**
 * 教師自助考核 API。後端：api/portal/appraisal.py。
 * 設計對齊 portal/salary：以 current_user.employee_id 鎖定身份；未 FINALIZED 不揭分數。
 */
import api from './index'
import type { AxiosResp } from './_generated/typed'

export const getMyAppraisals = (): AxiosResp<'/portal/my-appraisals', 'get'> =>
  api.get('/portal/my-appraisals')

export const getMyAppraisalDetail = (
  cycleId: number,
): AxiosResp<'/portal/my-appraisals/{cycle_id}', 'get'> =>
  api.get(`/portal/my-appraisals/${cycleId}`)

export const getMyAppraisalTrend = (): AxiosResp<'/portal/my-appraisals/trend', 'get'> =>
  api.get('/portal/my-appraisals/trend')
