import { closeWebSocketSafely } from '@/utils/ws'

const INITIAL_RECONNECT_MS = 1_000
const MAX_RECONNECT_MS = 30_000

type RefreshCallback = () => unknown

/**
 * 管理後台通知中心 WebSocket。
 *
 * HTTP-only auth cookie 由瀏覽器自動帶上；WS 只負責提示「資料已變更」，實際內容仍
 * 由 summary REST API 重新讀取，避免把敏感待辦資料塞進廣播 payload。
 */
export function useInboxNotifications(refresh: RefreshCallback) {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let started = false

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function invokeRefresh() {
    try {
      void Promise.resolve(refresh()).catch(() => undefined)
    } catch {
      // 輪詢仍會補抓；callback 失敗不應中斷 WS 重連生命週期。
    }
  }

  function scheduleReconnect() {
    if (
      !started ||
      reconnectTimer !== null ||
      (typeof document !== 'undefined' && document.hidden)
    ) {
      return
    }

    const delay = Math.min(
      INITIAL_RECONNECT_MS * 2 ** reconnectAttempt,
      MAX_RECONNECT_MS,
    )
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function connect() {
    if (!started || typeof WebSocket === 'undefined' || typeof window === 'undefined') return
    if (typeof document !== 'undefined' && document.hidden) return
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const current = new WebSocket(`${protocol}//${window.location.host}/api/ws/inbox`)
    socket = current

    current.onopen = () => {
      if (socket !== current) return
      reconnectAttempt = 0
      clearReconnectTimer()
    }
    current.onmessage = () => {
      if (socket === current && started) invokeRefresh()
    }
    current.onerror = () => {
      if (socket === current) closeWebSocketSafely(current)
    }
    current.onclose = () => {
      if (socket !== current) return
      socket = null
      scheduleReconnect()
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      clearReconnectTimer()
      const current = socket
      socket = null
      closeWebSocketSafely(current)
      return
    }

    invokeRefresh()
    connect()
  }

  function start() {
    if (started) return
    started = true
    document.addEventListener('visibilitychange', onVisibilityChange)
    connect()
  }

  function stop() {
    if (!started) return
    started = false
    document.removeEventListener('visibilitychange', onVisibilityChange)
    clearReconnectTimer()
    const current = socket
    socket = null
    closeWebSocketSafely(current)
  }

  return { start, stop }
}
