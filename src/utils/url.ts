// URL 安全工具：防止使用者可控的 URL（如才藝課程 video_url）被存成
// javascript: / data: 等 scheme 形成儲存型 XSS。
// 只放行 http / https 絕對 URL；其餘（含相對、協定相對、危險 scheme）一律視為不安全。

/**
 * 判斷字串是否為安全的 http(s) 絕對 URL。
 * - 只放行 scheme 為 http: / https: 的絕對 URL
 * - 擋 javascript: / data: / vbscript: / file: 等危險或非預期 scheme
 * - 擋空值、非字串、相對路徑、協定相對（//host）URL
 *
 * 用 URL 解析而非正則，避免 `java\tscript:` / 前綴空白等繞過變體。
 */
export function isSafeHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    // 相對路徑 / 協定相對 / 無 scheme → 解析失敗 → 視為不安全
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

/**
 * 將使用者可控的 URL 轉為可安全綁定到 :href 的值。
 * 安全的 http(s) URL 原樣回傳；其餘一律回 undefined（讓 :href 不渲染 href 屬性，
 * 連結變成不可點，杜絕 javascript: 等儲存型 XSS）。
 */
export function sanitizeHref(value: unknown): string | undefined {
  return isSafeHttpUrl(value) ? (value as string).trim() : undefined
}
