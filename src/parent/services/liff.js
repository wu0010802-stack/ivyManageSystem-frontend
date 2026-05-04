/**
 * LIFF SDK 初始化（家長 App）
 *
 * VITE_LIFF_ID 必須在 .env.local 設定（與後端 LINE_LOGIN_CHANNEL_ID 對應的
 * LIFF App ID）。LIFF App 必須綁定到與 Messaging Bot 同一個 LINE Provider
 * 下的 Login Channel，否則 id_token.sub 與 webhook source.userId 對不上。
 *
 * id_token refresh 行為：LIFF SDK 不主動 refresh id_token；access_token 預設
 * 30 天但 id_token 1 小時。第二次以後 liff.getIDToken() 可能回過期 token，
 * 後端 LINE /verify 會回 400 IdToken expired。需走完整 OAuth（logout + login）
 * 才會拿到新 id_token。helper 與 sessionStorage marker 用於避免無限 redirect。
 */

import liff from '@line/liff'

const LIFF_ID = import.meta.env.VITE_LIFF_ID || ''
const LIFF_REFRESH_MARKER = 'parent_liff_token_refresh_marker'
// id_token exp buffer：剩餘 < 60 秒視為需 refresh，避免送出途中過期
const ID_TOKEN_REFRESH_BUFFER_SECONDS = 60

let _initPromise = null

export function initLiff() {
  if (_initPromise) return _initPromise
  if (!LIFF_ID) {
    _initPromise = Promise.reject(
      new Error('VITE_LIFF_ID 未設定，無法初始化 LIFF'),
    )
    return _initPromise
  }
  _initPromise = liff.init({
    liffId: LIFF_ID,
    // 允許在外部瀏覽器（非 LINE 內）也走 OAuth 流程，方便桌面測試
    withLoginOnExternalBrowser: true,
  })
  return _initPromise
}

export function idTokenNeedsRefresh(payload, nowSec) {
  if (!payload || typeof payload.exp !== 'number') return true
  return payload.exp - nowSec < ID_TOKEN_REFRESH_BUFFER_SECONDS
}

export function clearLiffTokenRefreshMarker() {
  try {
    sessionStorage.removeItem(LIFF_REFRESH_MARKER)
  } catch (_) { /* sessionStorage 不可用（隱私模式）→ 忽略 */ }
}

export function forceLiffReloginOnce({ redirectUri, nowMs }) {
  // 同一 LIFF callback 來回只強制重 login 一次，避免無限 redirect
  try {
    if (sessionStorage.getItem(LIFF_REFRESH_MARKER)) return false
    sessionStorage.setItem(LIFF_REFRESH_MARKER, String(nowMs))
  } catch (_) { /* 隱私模式 → 不阻擋，仍嘗試一次重登入 */ }
  try {
    if (liff.isLoggedIn()) liff.logout()
  } catch (_) { /* logout 失敗不影響後續 redirect */ }
  liff.login({ redirectUri })
  return true
}

export { liff }
