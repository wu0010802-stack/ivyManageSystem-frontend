/**
 * 家長端連線狀態 singleton。
 *
 * - online：navigator.onLine + online/offline event
 * - wsConnected：透過 registerWs(ws) 接 open/close/error
 * - wsExpected：目前是否**有頁面需要** WS（registerWs 起、unregisterWs 止）。
 *   2026-08-13 修正：banner 曾把「沒有任何頁面開 WS」（wsConnected 初始 false）
 *   誤判成「斷線重連中」，導致除娃娃車即時頁外全站常駐「即時通知暫停，
 *   正在重連...」。「沒在用」≠「斷線」，兩者必須可分辨。
 * - lastDisconnectAt：最近斷線時刻（用於 ConnectionBanner 顯示秒數）
 */
import { ref } from 'vue'

const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
const wsConnected = ref(false)
const wsExpected = ref(false)
const lastDisconnectAt = ref<number | null>(null)

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

type RegisterableWs = { addEventListener?: (type: string, handler: () => void) => void }

// 目前「擁有」全域連線狀態的那條 socket。
// `addEventListener` 掛上去的 handler 卸不掉——`closeWebSocketSafely`（src/utils/ws.ts）
// 只把 `on*` 屬性設 null，動不到 listener。所以被換掉的舊 socket 之後吐出的 close/error
// 仍會把全域 wsConnected 寫成 false，在一條健康的新連線上閃「已斷線」。改以 socket
// identity 守衛（與 usePortalDismissalAlerts / useBusTracking 的 `ws !== socket` 同 idiom）：
// 非當前 socket 的事件一律忽略。
let currentWs: RegisterableWs | null = null

export function useConnectionStatus() {
  ensureBound()

  function registerWs(ws: RegisterableWs | null | undefined) {
    if (!ws || typeof ws.addEventListener !== 'function') return
    // 註冊新 socket 即接管：舊 socket 的 listener 自動失效
    currentWs = ws
    // 有持有者＝這個畫面確實需要即時連線，banner 才有資格評斷「斷線」
    wsExpected.value = true
    ws.addEventListener('open', () => {
      if (currentWs !== ws) return
      wsConnected.value = true
    })
    ws.addEventListener('close', () => {
      if (currentWs !== ws) return
      wsConnected.value = false
      lastDisconnectAt.value = Date.now()
    })
    ws.addEventListener('error', () => {
      if (currentWs !== ws) return
      wsConnected.value = false
      lastDisconnectAt.value = Date.now()
    })
  }

  /**
   * 交還全域連線狀態的所有權（teardown 用；沒有新 socket 接手時必須呼叫，
   * 否則全域狀態會繼續被一條沒人擁有的 socket 決定）。
   * 帶入非當前 socket 時為 no-op，避免舊持有者誤清新連線的狀態。
   */
  function unregisterWs(ws?: RegisterableWs | null) {
    if (ws && currentWs !== ws) return
    currentWs = null
    wsConnected.value = false
    // 沒有持有者＝目前沒有頁面需要 WS，banner 不得再顯示「重連中」
    wsExpected.value = false
  }

  return { online, wsConnected, wsExpected, lastDisconnectAt, registerWs, unregisterWs }
}

export function _resetConnectionStatusForTest() {
  online.value = typeof navigator !== 'undefined' ? navigator.onLine : true
  wsConnected.value = false
  wsExpected.value = false
  lastDisconnectAt.value = null
  currentWs = null
}
