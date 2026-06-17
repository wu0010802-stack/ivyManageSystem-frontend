// HTML 跳脫工具：把使用者可控文字安全嵌入 HTML 字串
// （如 ElMessageBox dangerouslyUseHTMLString 場景），避免儲存型/反射型 XSS。

const _HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 跳脫 HTML 五個敏感字元（& < > " '），使內容無法被當成 HTML 元素解析。
 * null / undefined 轉為空字串；其餘型別先 String() 化。
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => _HTML_ESCAPE_MAP[ch])
}
