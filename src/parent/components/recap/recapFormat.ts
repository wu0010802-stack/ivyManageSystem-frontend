/**
 * 相簿回顧的純顯示工具（RecapRail / RecapViewer 共用）。
 *
 * 日期一律當字串切，不經 `new Date()`：後端給的是純日期 'YYYY-MM-DD'，
 * 丟給 Date 會被當成 UTC 午夜，台北（UTC+8）顯示時整批倒退一天
 * （CLAUDE.md「Datetime 與 Taipei TZ」段的既有踩雷）。
 */
import type { RecapPhoto } from '../../api/childPhotos'

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'；格式不對時回空字串而非殘缺日期。 */
export function formatRecapDate(date: string | null | undefined): string {
  const parts = (date || '').split('-')
  return parts.length === 3 ? parts.join('/') : ''
}

/**
 * 回顧涵蓋的日期區間。
 *
 * 同年省略結束日的年份（`2026/08/11 – 08/21`），跨年才兩邊都標
 * （`2025/12/28 – 2026/01/07`）——時間窗是錨點日前後各 5 天，跨年真的會發生。
 */
export function formatRecapRange(start: string, end: string): string {
  const s = (start || '').split('-')
  const e = (end || '').split('-')
  if (s.length !== 3 || e.length !== 3) return ''
  return s[0] === e[0]
    ? `${s[0]}/${s[1]}/${s[2]} – ${e[1]}/${e[2]}`
    : `${s[0]}/${s[1]}/${s[2]} – ${e[0]}/${e[1]}/${e[2]}`
}

/** 縮圖用 src（封面卡、膠卷列）。 */
export function recapThumbSrc(photo: RecapPhoto): string {
  return photo.thumb_url || photo.display_url || photo.url || ''
}

/** 大圖用 src（輪播主畫面）。 */
export function recapDisplaySrc(photo: RecapPhoto): string {
  return photo.display_url || photo.url || photo.thumb_url || ''
}
