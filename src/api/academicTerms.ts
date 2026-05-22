/**
 * /academic-terms CRUD wrappers — 學年學期設定。
 */
import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

/**
 * GET /academic-terms — 列出所有學年學期（倒序排列）。
 */
export function listAcademicTerms(): AxiosResp<'/academic-terms', 'get'> {
  return api.get('/academic-terms')
}

/**
 * GET /academic-terms/current — 回傳今日所在學期（查無回 null）。
 */
export function getCurrentTerm(): AxiosResp<'/academic-terms/current', 'get'> {
  return api.get('/academic-terms/current')
}

/**
 * POST /academic-terms — 新增學年學期設定。
 */
export function createAcademicTerm(
  payload: ApiBody<'/academic-terms', 'post'>,
): AxiosResp<'/academic-terms', 'post'> {
  return api.post('/academic-terms', payload)
}

/**
 * PUT /academic-terms/{term_id} — 更新學年學期設定。
 */
export function updateAcademicTerm(
  id: number,
  payload: ApiBody<'/academic-terms/{term_id}', 'put'>,
): AxiosResp<'/academic-terms/{term_id}', 'put'> {
  return api.put(`/academic-terms/${id}`, payload)
}

/**
 * DELETE /academic-terms/{term_id} — 刪除學年學期設定。
 */
export function deleteAcademicTerm(
  id: number,
): AxiosResp<'/academic-terms/{term_id}', 'delete'> {
  return api.delete(`/academic-terms/${id}`)
}
