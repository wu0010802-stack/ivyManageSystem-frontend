export const WS_LIVENESS_TIMEOUT_MS = 90000
export const WS_RECOVERY_RETRY_MS = 60000

export type WebSocketCloseKind = 'auth' | 'permission' | 'rate-limit' | 'transport'

export interface WebSocketCloseInfo {
  code: number
  kind: WebSocketCloseKind
  reason: string
  message: string
}

/**
 * 將 CloseEvent 正規化為可安全顯示的原因。
 *
 * WebSocket reason 由服務端或中介層提供，可能夾帶 token／個資，因此不保留原始文字；
 * 僅依 code 產生固定訊息，供 UI 與診斷狀態使用。
 * 注意：server 在 accept 前拒絕握手時，瀏覽器通常只回報 1006；400x 細分類僅適用於
 * Upgrade 完成後收到的 close frame（例如已連線 token 週期重驗失敗）。
 */
export function classifyWebSocketClose(
  event: Pick<CloseEvent, 'code' | 'reason'>,
): WebSocketCloseInfo {
  if (event.code === 4001 || event.code === 4003) {
    return {
      code: event.code,
      kind: 'auth',
      reason: 'authentication_rejected',
      message: '登入狀態已失效，請重新登入後再試',
    }
  }
  if (event.code === 4007 || event.code === 4403) {
    return {
      code: event.code,
      kind: 'permission',
      reason: 'permission_rejected',
      message: '帳號權限或連線來源受限，請聯絡管理員',
    }
  }
  if (event.code === 4029 || event.code === 1008) {
    return {
      code: event.code,
      kind: 'rate-limit',
      reason: 'connection_rate_limited',
      message: '即時連線過於頻繁，系統稍後會自動重試',
    }
  }
  if (event.code === 1006) {
    return {
      code: event.code,
      kind: 'transport',
      reason: 'abnormal_transport_close',
      message: 'WebSocket 握手失敗或網路中斷，系統正在使用備援並自動重試',
    }
  }
  return {
    code: event.code,
    kind: 'transport',
    reason: 'transport_closed',
    message: '即時連線暫時中斷，系統正在使用備援並自動重試',
  }
}

/**
 * 安全關閉 WebSocket：先卸掉所有 handler 再 close。
 *
 * 直接 ws.close() 會觸發仍掛著的 onclose → scheduleReconnect，在元件卸載後建立
 * 殭屍重連 / 輪詢（QA 2026-06-04 P2-5）。先把 handler 設 null 再 close，使 close()
 * 不再觸發重連排程。與半開偵測 bumpLiveness 的 idiom 一致。
 */
export function closeWebSocketSafely(socket: WebSocket | null): void {
  if (!socket) return
  socket.onclose = null
  socket.onerror = null
  socket.onmessage = null
  socket.onopen = null
  try {
    socket.close()
  } catch {
    /* ignore */
  }
}
