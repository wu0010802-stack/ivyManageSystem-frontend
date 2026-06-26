/**
 * 台北牆鐘（Asia/Taipei）時間工具 — 接送通知跨角色共用。
 *
 * 後端多數時間欄位（dismissal.requested_at / completed_at、attendance 等）是
 * 「台北牆鐘」的 naive ISO 字串（無時區 offset，見 backend models/dismissal
 * ._now_taipei_naive）。直接 `new Date(iso)` 會以「裝置本地時區」解析，台灣
 * 裝置剛好正確，但非台灣時區（或時區設定錯誤）的裝置會整個位移 8 小時：
 *   - 等候時間（now − requested_at）會誤判緊急度
 *   - 顯示的時刻 / 用來分時段桶的小時都會錯
 *
 * 因此本檔一律：① 解析時對 naive 字串顯式錨定 +08:00 ② 顯示 / 取小時時顯式
 * 以 `timeZone: 'Asia/Taipei'` 格式化，任何裝置時區都算得對。
 *
 * 純函式、零執行期依賴（不 import vue），可安全被 parent bundle 引用而不會
 * 把 admin / portal 的 chunk 拉進來。
 */

const TAIPEI_OFFSET = '+08:00'
// 已帶時區資訊（Z 或 ±HH:MM / ±HHMM）的字串不重複錨定。
const HAS_OFFSET_RE = /([zZ])$|([+-]\d{2}:?\d{2})$/

/**
 * 解析後端時間字串為正確時刻的 Date。
 * naive（無 offset）字串錨定為台北 +08:00；已帶 offset/Z 的原樣解析。
 * 空值 / 不合法回 null。
 */
export function parseTaipeiDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const anchored = HAS_OFFSET_RE.test(iso) ? iso : `${iso}${TAIPEI_OFFSET}`
  const d = new Date(anchored)
  return Number.isNaN(d.getTime()) ? null : d
}

// 以台北時區把 Date 拆成 {hour, minute} 數字。hour12:false 在部分引擎午夜
// 會回 '24'，這裡統一歸 0。
function taipeiParts(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei',
  }).formatToParts(d)
  const rawHour = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const rawMinute = parts.find((p) => p.type === 'minute')?.value ?? '0'
  let hour = Number(rawHour)
  if (hour === 24) hour = 0
  return { hour, minute: Number(rawMinute) }
}

/**
 * 顯示用台北牆鐘 `HH:mm`（零補位）。空值 / 不合法回 null。
 * 顯式以 Asia/Taipei 格式化，裝置時區無關。
 */
export function formatTaipeiClock(iso: string | null | undefined): string | null {
  const d = parseTaipeiDate(iso)
  if (!d) return null
  const { hour, minute } = taipeiParts(d)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 取台北時區的小時（0–23），供時段桶分配用。空值 / 不合法回 null。
 */
export function taipeiHour(iso: string | null | undefined): number | null {
  const d = parseTaipeiDate(iso)
  if (!d) return null
  return taipeiParts(d).hour
}
