/**
 * LIFF SDK 初始化（家長 App）。owner = fb（CT-X-06 / CT-F-08，原屬 pp）。
 *
 * ## LIFF ID 改 runtime 取得（多租戶 4d/fb）
 *
 * LIFF App 綁定的是「某一個 LINE Login Channel」，而每間園所有自己的 LINE 官方帳號
 * ⇒ LIFF ID 必然 per-tenant，**不能**是 build-time 的 `VITE_LIFF_ID`（一個 image
 * 服務多租戶時，烤進 bundle 的 ID 會把 B 校家長送去 A 校的 LINE Login）。
 * 改為 init 前 `await fetchTenantMeta()` 取 `liff_id`（來源 `line_configs.liff_id`）。
 *
 * `VITE_LIFF_ID` 降為**過渡 fallback**：品牌 API 尚未上線 / 單租戶模式時仍可運作。
 * 階段 3（Sentry 觀察 fallback 命中為零一個 release 後）刪除該分支與 Dockerfile ARG。
 *
 * 時序（已核實呼叫鏈）：`src/parent/main.ts` 在 boot 就 `void fetchTenantMeta()` 預熱，
 * 與 router 首導航的 `/parent/me` probe 並行；`LoginView.startLogin()` 的流程不變；
 * LIFF OAuth redirect 回來後重新 `await initLiff()` 的成本可忽略（同 origin GET +
 * 後端 60s 服務層快取 + 瀏覽器 max-age=300）。
 *
 * LIFF App 必須綁定到與 Messaging Bot 同一個 LINE Provider 下的 Login Channel，
 * 否則 id_token.sub 與 webhook source.userId 對不上。
 *
 * id_token refresh 行為：LIFF SDK 不主動 refresh id_token；access_token 預設
 * 30 天但 id_token 1 小時。第二次以後 liff.getIDToken() 可能回過期 token，
 * 後端 LINE /verify 會回 400 IdToken expired。需走完整 OAuth（logout + login）
 * 才會拿到新 id_token。helper 與 sessionStorage marker 用於避免無限 redirect。
 */

import liff from '@line/liff'

import { fetchTenantMetaForLiff } from '@/api/tenantMeta'
import { markLineClientFromSdk } from '../utils/lineClient'

const LIFF_REFRESH_MARKER = 'parent_liff_token_refresh_marker'
// id_token exp buffer：剩餘 < 60 秒視為需 refresh，避免送出途中過期
const ID_TOKEN_REFRESH_BUFFER_SECONDS = 60

let _initPromise: Promise<void> | null = null

/** 過渡 fallback：品牌 API 未上線 / 單租戶模式時沿用 build 變數。階段 3 刪除。 */
function envLiffId(): string {
  return (import.meta.env.VITE_LIFF_ID as string | undefined) || ''
}

async function resolveLiffId(): Promise<string> {
  try {
    // ⚠ 用 `fetchTenantMetaForLiff()` 而**非** `fetchTenantMeta()`：後者被品牌灰度
    // 閘門擋住時會直接 reject、連請求都不發，而該閘門讀的是 build-time 旗標——
    // Zeabur 實測不會把 service variables 傳成 build-arg，旗標在正式環境恆為空
    // ⇒ 家長端會連 LIFF ID 都拿不到而完全無法登入（2026-08-11 prod 事故）。
    const id = (await fetchTenantMetaForLiff()).liff_id
    if (id) return id
  } catch {
    // tenant-meta 不可用（網路錯誤 / 端點未上線）→ 走過渡 fallback。
    // 404/403/503 這三種「這個網域不是有效園所」的情況已由 useTenantBranding 的
    // 三態遮罩接管（CT-F-01），不需要在這裡重複判斷。
  }
  return envLiffId()
}

export function initLiff(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    const liffId = await resolveLiffId()
    if (!liffId) {
      // 訊息刻意指向「園所設定」而非工程 env：看到這行的是家長，不是工程師。
      throw new Error('此園所尚未設定 LIFF ID，請聯絡園所確認 LINE 設定')
    }
    await liff.init({
      liffId,
      // 允許在外部瀏覽器（非 LINE 內）也走 OAuth 流程，方便桌面測試
      withLoginOnExternalBrowser: true,
    })
    // SDK 就緒後把權威判斷回填給 utils/lineClient（SPEC-020 CT-M-02）。
    // 在此之前該模組靠 User-Agent 推斷，未登入家長走到這裡即升級為 SDK 判斷。
    try {
      markLineClientFromSdk(liff.isInClient())
    } catch {
      // isInClient() 理論上 init 後必可用；萬一拋錯就維持 UA 推斷，不影響登入。
    }
  })()
  // 失敗即清空，讓 LoginView 的 manualRetry 能真的重試（原本 reject 會被永久快取）。
  _initPromise = _initPromise.catch((e: unknown) => {
    _initPromise = null
    throw e
  })
  return _initPromise
}

/** 測試專用：重置 init promise。 */
export function _resetLiffInitForTests(): void {
  _initPromise = null
}

export function idTokenNeedsRefresh(payload: { exp?: number } | null | undefined, nowSec: number): boolean {
  if (!payload || typeof payload.exp !== 'number') return true
  return payload.exp - nowSec < ID_TOKEN_REFRESH_BUFFER_SECONDS
}

export function clearLiffTokenRefreshMarker(): void {
  try {
    sessionStorage.removeItem(LIFF_REFRESH_MARKER)
  } catch (_) { /* sessionStorage 不可用（隱私模式）→ 忽略 */ }
}

export function forceLiffReloginOnce({ redirectUri, nowMs }: { redirectUri: string; nowMs: number }): boolean {
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
