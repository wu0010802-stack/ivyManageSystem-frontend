/**
 * LIFF SDK 初始化（家長 App）
 *
 * VITE_LIFF_ID 必須在 .env.local 設定（與後端 LINE_LOGIN_CHANNEL_ID 對應的
 * LIFF App ID）。LIFF App 必須綁定到與 Messaging Bot 同一個 LINE Provider
 * 下的 Login Channel，否則 id_token.sub 與 webhook source.userId 對不上。
 */

import liff from '@line/liff'

const LIFF_ID = import.meta.env.VITE_LIFF_ID || ''

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

export { liff }
