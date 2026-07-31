/**
 * 登入/綁定成功後導回原頁用的「安全站內相對路徑」驗證。
 *
 * `redirect` 這個值來自 URL query string（使用者可控），家長端入口又常是
 * LINE 推播點進來的釣魚面，因此在拿去 `router.replace()` 或
 * `window.location.hash` 之前一律先驗證：只接受站內相對路徑，
 * 任何看起來會被瀏覽器解析成外站的輸入都視為不安全。
 *
 * 擋的項目：
 * - 絕對 URL（`https://evil.com`）：直接不是以單一 `/` 開頭
 * - 協議相對路徑（開頭 `//`）：瀏覽器會依目前協議補上，等同導去外站
 * - 開頭混雜反斜線（`/\evil.com`、`\\evil.com`）：部分瀏覽器把 `\` 當 `/`
 *   解析，是常見的 open-redirect 繞過手法
 * - 非 `/` 開頭的任何值（含 `javascript:` 偽協議、裸網域）
 * - 前導/尾隨空白、控制字元（換行、tab 等）：常見的過濾繞過技巧
 */

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function isSafeRedirectPath(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0) return false
  if (raw.trim() !== raw) return false
  if (hasControlChar(raw)) return false
  if (!raw.startsWith('/')) return false
  // 排除 `//`（protocol-relative）與 `/\`（部分瀏覽器等效於 `//`）
  if (raw.startsWith('//') || raw.startsWith('/\\')) return false
  return true
}

/** 驗證失敗或缺值一律 fallback；預設 `/home`（呼叫端多為登入/綁定完成後導回首頁）。 */
export function resolveSafeRedirect(raw: unknown, fallback = '/home'): string {
  return isSafeRedirectPath(raw) ? raw : fallback
}
