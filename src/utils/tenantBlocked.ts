/**
 * 掛載 `TenantBlockedScreen.vue` 的單一入口（frontend-core §2.1 / §2.2）。
 *
 * 三條路徑共用同一款遮罩，避免三種長相不同的錯誤畫面：
 *   1. boot：`isTenantModeEnabled()` 但 `resolveTenant()` 回 null（誤配 DNS / 直連 IP）
 *   2. 兩個 axios instance 的 response interceptor 命中 404/403/503 租戶三態碼
 *   3. fb 的 `tenantMeta.ts`（CT-F-01）
 *
 * 特性：
 * - **idempotent**：重複呼叫只掛一次（多個並發請求同時命中三態碼是常態）。
 * - **非同步載入元件**：遮罩是罕見路徑，不應進入三個 entry 的首屏 chunk
 *   （家長端首屏預算最緊）。掛載前先塞一個純文字節點，避免載入期間白畫面。
 * - **不依賴 router / pinia / element-plus**：boot 期尚未掛 router 也能用。
 */
import type { TenantErrorCode } from '@/utils/tenant'

const CONTAINER_ID = 'tenant-blocked-root'
let _shown = false

/** 遮罩是否已顯示（呼叫端據此停止 boot / 停止後續請求）。 */
export function isTenantBlocked(): boolean {
  return _shown
}

/**
 * 顯示租戶三態遮罩並封鎖畫面。已顯示過則直接 return（不重複掛載、不覆蓋文案：
 * 第一個命中的錯誤才是根因，後續並發請求的錯誤多半是它的衍生）。
 */
export function showTenantBlocked(code: TenantErrorCode): void {
  if (_shown || typeof document === 'undefined') return
  _shown = true
  const host = document.createElement('div')
  host.id = CONTAINER_ID
  document.body.appendChild(host)
  void Promise.all([import('vue'), import('@/components/system/TenantBlockedScreen.vue')])
    .then(([{ createApp }, mod]) => {
      createApp(mod.default, { code }).mount(host)
    })
    .catch(() => {
      // chunk 載不下來（斷網 / 舊 SW）時仍必須擋住畫面，不能靜默放行。
      host.textContent = '無法識別園所，請確認網址是否正確。'
      host.setAttribute(
        'style',
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;'
          + 'justify-content:center;background:#f5f6f8;color:#303133;font:14px system-ui',
      )
    })
}

/** 測試專用：重設「已顯示」旗標並移除既有遮罩節點。 */
export function _resetTenantBlockedForTests(): void {
  _shown = false
  if (typeof document !== 'undefined') document.getElementById(CONTAINER_ID)?.remove()
}
