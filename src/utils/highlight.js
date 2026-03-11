/**
 * 將文字中符合關鍵字的部分用 <mark> 包裹，以便前端高亮顯示。
 * 先進行 HTML 跳脫再做 RegExp 替換，防止 XSS。
 *
 * @param {*} text - 原始文字（任意型別，自動轉 string）
 * @param {string} keyword - 搜尋關鍵字
 * @returns {string} 含 HTML 標記的字串
 */
export function highlight(text, keyword) {
  if (text === null || text === undefined) return ''
  const safeText = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  if (!keyword || !keyword.trim()) return safeText
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safeText.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark class="search-highlight">$1</mark>',
  )
}
