import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// 管理端：臨時接送授權總覽與代核銷。對應後端 api/pickup_authorizations.py。

export const listPickupAuthorizations = (
  params?: ApiQuery<'/pickup-authorizations', 'get'>,
): AxiosResp<'/pickup-authorizations', 'get'> =>
  api.get('/pickup-authorizations', { params })

export const verifyPickupAuthorization = (
  authId: number,
  data: ApiBody<'/pickup-authorizations/{auth_id}/verify', 'post'>,
): AxiosResp<'/pickup-authorizations/{auth_id}/verify', 'post'> =>
  api.post(`/pickup-authorizations/${authId}/verify`, data)

export const overridePickupAuthorization = (
  authId: number,
  data: ApiBody<'/pickup-authorizations/{auth_id}/override-complete', 'post'>,
): AxiosResp<'/pickup-authorizations/{auth_id}/override-complete', 'post'> =>
  api.post(`/pickup-authorizations/${authId}/override-complete`, data)

// D10④：POS 佇列卡目視比對明碼後一鍵確認，不重新輸入 6 碼（T-022）。
export const confirmVisualMatch = (
  authId: number,
): AxiosResp<'/pickup-authorizations/{auth_id}/confirm-visual-match', 'post'> =>
  api.post(`/pickup-authorizations/${authId}/confirm-visual-match`)
