/**
 * 家長端連線狀態 singleton。
 *
 * - online：navigator.onLine + online/offline event
 * - wsConnected：透過 registerWs(ws) 接 open/close/error
 * - lastDisconnectAt：最近斷線時刻（用於 ConnectionBanner 顯示秒數）
 */
import { ref } from 'vue'

const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
const wsConnected = ref(false)
const lastDisconnectAt = ref(null)

let bound = false
function ensureBound() {
  // 每次呼叫先同步一次 navigator.onLine，避免 listener 尚未觸發前 ref 與真實狀態漂移
  if (typeof navigator !== 'undefined') online.value = navigator.onLine
  if (bound || typeof window === 'undefined') return
  window.addEventListener('online', () => { online.value = true })
  window.addEventListener('offline', () => {
    online.value = false
    lastDisconnectAt.value = Date.now()
  })
  bound = true
}

export function useConnectionStatus() {
  ensureBound()

  function registerWs(ws) {
    if (!ws || typeof ws.addEventListener !== 'function') return
    ws.addEventListener('open', () => { wsConnected.value = true })
    ws.addEventListener('close', () => {
      wsConnected.value = false
      lastDisconnectAt.value = Date.now()
    })
    ws.addEventListener('error', () => {
      wsConnected.value = false
      lastDisconnectAt.value = Date.now()
    })
  }

  return { online, wsConnected, lastDisconnectAt, registerWs }
}

export function _resetConnectionStatusForTest() {
  online.value = typeof navigator !== 'undefined' ? navigator.onLine : true
  wsConnected.value = false
  lastDisconnectAt.value = null
}
