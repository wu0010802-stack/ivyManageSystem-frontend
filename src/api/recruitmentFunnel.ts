/**
 * /funnel/* API wrappers — 招生漏斗看板 (Phase A BE).
 */
import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export interface GetBoardParams {
  schoolYear?: number | null
  semester?: number | null
}

/**
 * GET /funnel/board — 取得 4 階段看板資料。
 */
export function getFunnelBoard(
  params: GetBoardParams = {},
): AxiosResp<'/funnel/board', 'get'> {
  const query: ApiQuery<'/funnel/board', 'get'> = {}
  if (params.schoolYear != null) query.school_year = params.schoolYear
  if (params.semester != null) query.semester = params.semester
  return api.get('/funnel/board', { params: query })
}

/**
 * POST /funnel/visits/{visit_id}/transition — 驅動 state machine 轉換階段。
 */
export function transitionVisit(
  visitId: number,
  payload: ApiBody<'/funnel/visits/{visit_id}/transition', 'post'>,
): AxiosResp<'/funnel/visits/{visit_id}/transition', 'post'> {
  return api.post(`/funnel/visits/${visitId}/transition`, payload)
}

/**
 * GET /funnel/visits/{visit_id}/timeline — 取得訪視時間軸事件。
 */
export function getTimeline(
  visitId: number,
): AxiosResp<'/funnel/visits/{visit_id}/timeline', 'get'> {
  return api.get(`/funnel/visits/${visitId}/timeline`)
}
