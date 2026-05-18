/**
 * 家長端日期工具
 *
 * 為何不用 `Date.prototype.toISOString().slice(0, 10)`：
 *   toISOString 永遠以 UTC 輸出，在台灣（UTC+8）零點到八點之間會回到「昨天」，
 *   造成聯絡簿 MonthDateStrip 把本地當日 chip 對到隔天 chip、且當日紀錄
 *   `has-entry` 無法 hit 到 today chip。
 *
 * `localDateISO(d)` 回傳當機 (host) 時區下的 `YYYY-MM-DD`，與後端
 *   parent_portal/contact_book.py 使用 Taipei 本地日期的語意一致。
 */

/**
 * @param {Date} d
 * @returns {string} `YYYY-MM-DD`（本地時區）
 */
export function localDateISO(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
