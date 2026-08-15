/**
 * 家長端「預告接送」API。
 *
 * 對應後端 api/parent_portal/dismissal_calls.py（pnotice01）。
 * ⚠ 這不是臨時接送授權（pickup.ts / /parent/pickup-*）——預告接送只是提前
 * 通知園所「本人多久後抵達」；親友代接請走臨時接送授權，兩者不可混用。
 */
import type { ApiBody, ApiQuery, AxiosResp, Schema } from '@/api/_generated/typed'
import api from './index'

export type ParentDismissalCall = Schema<'ParentDismissalCallOut'>

export function createDismissalNotice(
  payload: ApiBody<'/parent/dismissal-calls', 'post'>,
): AxiosResp<'/parent/dismissal-calls', 'post'> {
  return api.post('/parent/dismissal-calls', payload)
}

export function listDismissalNotices(
  params: ApiQuery<'/parent/dismissal-calls', 'get'> = {},
): AxiosResp<'/parent/dismissal-calls', 'get'> {
  return api.get('/parent/dismissal-calls', { params })
}

export function arriveDismissalNotice(
  callId: number,
): AxiosResp<'/parent/dismissal-calls/{call_id}/arrive', 'post'> {
  return api.post(`/parent/dismissal-calls/${callId}/arrive`)
}

export function cancelDismissalNotice(
  callId: number,
): AxiosResp<'/parent/dismissal-calls/{call_id}/cancel', 'post'> {
  return api.post(`/parent/dismissal-calls/${callId}/cancel`)
}
