import api from './index'

// 管理端
export const createDismissalCall = (data: unknown) => api.post('/dismissal-calls', data)
export const getDismissalCalls = (params: unknown) => api.get('/dismissal-calls', { params })
export const cancelDismissalCall = (id: number) => api.post(`/dismissal-calls/${id}/cancel`)
// 標記已到門口（pnotice01 家長預告接送：辦公室代替忘記按抵達的家長操作）
export const arriveDismissalCall = (id: number) => api.post(`/dismissal-calls/${id}/arrive`)

// 教師 portal
export const getPortalDismissalCalls = () => api.get('/portal/dismissal-calls')
export const getPortalPendingCount = () => api.get('/portal/dismissal-calls/pending-count')
export const acknowledgeDismissalCall = (id: number) => api.post(`/portal/dismissal-calls/${id}/acknowledge`)
export const completeDismissalCall = (id: number) => api.post(`/portal/dismissal-calls/${id}/complete`)

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
