/**
 * 公告相對時間格式化（剛剛 / N 分鐘前 / N 小時前 / N 天前 / M/D）。
 *
 * 原本只存在於 AnnouncementsPanel.vue 內部（未匯出）。2026-09 首頁改版新增
 * AnnouncementsHomeCard 需要同一份措辭，抽成共用 util 讓兩處 import，避免
 * 出現第二份幾乎相同卻用字不一致的實作（沿用既有規範「相同計算出現兩次就
 * 提取成函式」）。
 *
 * 與 `@/parent/utils/datetime.ts` 的 `fmtRelative` 用字不同（「剛才」vs「剛剛」、
 * 無「昨天」特例）——那份是聊天/通知列表既有措辭，公告相關頁面沿用本檔，
 * 兩份刻意不合併，避免任一邊改用字時把對方的既有文案一併改掉。
 */
export function formatAnnouncementRelativeTime(s: string | null | undefined): string {
  if (!s) return ''
  try {
    const d = new Date(s.replace(' ', 'T'))
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const min = Math.floor(diffMs / 60000)
    if (min < 1) return '剛剛'
    if (min < 60) return `${min} 分鐘前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} 小時前`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day} 天前`
    return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
  } catch {
    return s ? s.replace('T', ' ').slice(0, 16) : ''
  }
}
