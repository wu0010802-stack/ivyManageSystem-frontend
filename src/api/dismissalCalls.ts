import type { AxiosRequestConfig } from 'axios'
import api from './index'
import type { ApiBody, ApiResponse, AxiosResp } from './_generated/typed'

/** apiDedupe 逃生口（比照 src/api/activity.ts withDedupeEscape）：寫入後的重抓不可領到在途的舊快照 */
const DEDUPE_ESCAPE: AxiosRequestConfig & { meta: { allowConcurrent: boolean } } = {
  meta: { allowConcurrent: true },
}

// 管理端
export const createDismissalCall = (
  data: ApiBody<'/dismissal-calls', 'post'>,
): AxiosResp<'/dismissal-calls', 'post'> => api.post('/dismissal-calls', data)
export const getDismissalCalls = (params: unknown) => api.get('/dismissal-calls', { params })
/** 寫入後的重抓：繞過 apiDedupe 的 in-flight 合併 */
export const getDismissalCallsFresh = (params: unknown) =>
  api.get('/dismissal-calls', { ...DEDUPE_ESCAPE, params })
export const cancelDismissalCall = (id: number) => api.post(`/dismissal-calls/${id}/cancel`)
// 標記已到門口（pnotice01 家長預告接送：辦公室代替忘記按抵達的家長操作）
export const arriveDismissalCall = (id: number) => api.post(`/dismissal-calls/${id}/arrive`)

// 接送 POS 串接請假／娃娃車（posbus01）：全園今日請假＋已上放學車名單，與辦公室手動補登
export type DismissalPosStatus = ApiResponse<'/dismissal-calls/pos-status', 'get'>
export const getDismissalPosStatus = (
  { force = false }: { force?: boolean } = {},
): AxiosResp<'/dismissal-calls/pos-status', 'get'> =>
  force ? api.get('/dismissal-calls/pos-status', DEDUPE_ESCAPE) : api.get('/dismissal-calls/pos-status')
export const markPosLeave = (
  data: ApiBody<'/dismissal-calls/pos-leave', 'post'>,
): AxiosResp<'/dismissal-calls/pos-leave', 'post'> => api.post('/dismissal-calls/pos-leave', data)
export const unmarkPosLeave = (studentId: number) =>
  api.delete(`/dismissal-calls/pos-leave/${studentId}`)
export const markPosBus = (
  data: ApiBody<'/dismissal-calls/pos-bus', 'post'>,
): AxiosResp<'/dismissal-calls/pos-bus', 'post'> => api.post('/dismissal-calls/pos-bus', data)
export const unmarkPosBus = (callId: number) => api.delete(`/dismissal-calls/pos-bus/${callId}`)

// 教師 portal
export const getPortalDismissalCalls = () => api.get('/portal/dismissal-calls')
export const getPortalPendingCount = () => api.get('/portal/dismissal-calls/pending-count')
export const acknowledgeDismissalCall = (id: number) => api.post(`/portal/dismissal-calls/${id}/acknowledge`)
export const completeDismissalCall = (id: number) => api.post(`/portal/dismissal-calls/${id}/complete`)
// 教師端取消（pending/acknowledged 可取消；誤建/家長改口，不必再找管理端）
export const cancelPortalDismissalCall = (id: number) => api.post(`/portal/dismissal-calls/${id}/cancel`)

// ---------------------------------------------------------------------------
// WebSocket 自訂關閉碼（對應後端 dismissal_ws.py 定義）
// ---------------------------------------------------------------------------
export const WS_CLOSE = {
  MISSING_TOKEN: 4001,  // 未提供 Token，應導向登入頁
  INVALID_TOKEN: 4003,  // Token 無效或過期，應導向登入頁
  FORBIDDEN: 4007,      // 權限不足，顯示提示即可，不需重新登入
}

/**
 * 建立接送通知 WebSocket 連線。
 * @param {'portal'|'admin'} role
 */
export function createDismissalWebSocket(
  role: 'portal' | 'admin',
  {
    onMessage,
    onAuthError,
    onPermissionError,
    onDisconnect,
  }: {
    onMessage?: (data: unknown) => void
    onAuthError?: (reason: string) => void
    onPermissionError?: (reason: string) => void
    onDisconnect?: (event: CloseEvent) => void
  } = {},
) {
  const path = role === 'admin' ? '/api/ws/admin/dismissal-calls' : '/api/ws/portal/dismissal-calls'
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}${path}`)

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage?.(data)
    } catch {
      // 非 JSON 訊息忽略
    }
  }

  ws.onclose = (event) => {
    if (event.code === WS_CLOSE.MISSING_TOKEN || event.code === WS_CLOSE.INVALID_TOKEN) {
      onAuthError?.(event.reason)
    } else if (event.code === WS_CLOSE.FORBIDDEN) {
      onPermissionError?.(event.reason)
    } else {
      onDisconnect?.(event)
    }
  }

  return ws
}
