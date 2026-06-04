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
