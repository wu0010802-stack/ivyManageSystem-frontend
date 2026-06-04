/**
 * /recruitment/intake* + reserve-seat API wrappers — 新生名額規劃 / 暫定編班。
 */
import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

/** GET /recruitment/intake-plan — 名額彙總（年級 × 計畫/保留/註冊/剩餘）。 */
export function getIntakePlan(
  params: ApiQuery<'/recruitment/intake-plan', 'get'>,
): AxiosResp<'/recruitment/intake-plan', 'get'> {
  return api.get('/recruitment/intake-plan', { params })
}

/** PUT /recruitment/intake-targets — 設定每年級計畫名額。 */
export function setIntakeTargets(
  payload: ApiBody<'/recruitment/intake-targets', 'put'>,
): AxiosResp<'/recruitment/intake-targets', 'put'> {
  return api.put('/recruitment/intake-targets', payload)
}

/** POST /recruitment/funnel/visits/{visit_id}/reserve-seat — 設定/釋放暫定編班（null grade = 釋放）。 */
export function reserveSeat(
  visitId: number,
  payload: ApiBody<'/recruitment/funnel/visits/{visit_id}/reserve-seat', 'post'>,
): AxiosResp<'/recruitment/funnel/visits/{visit_id}/reserve-seat', 'post'> {
  return api.post(`/recruitment/funnel/visits/${visitId}/reserve-seat`, payload)
}
