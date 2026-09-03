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

// 以台北時區把 Date 拆成 {year, month, day} 數字。
function taipeiDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Taipei',
  }).formatToParts(d)
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const

/**
 * 接受 ISO 字串或 `Date`（後者供「現在」用）。收 `Date` 是為了讓呼叫端不必寫
 * `new Date().toISOString()` ——那個模式已被 eslint `no-restricted-syntax` 擋下
 * （`toISOString()` 是 UTC，台北凌晨會跨日），即使這裡接得住，也不該讓每個呼叫端
 * 各自繞過一條防呆規則。
 */
function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  return parseTaipeiDate(value)
}

/**
 * 顯示用台北曆日 `M/D（週）`，例如 `9/3（四）`。接受 ISO 字串或 `Date`；空值 / 不合法回 null。
 *
 * 星期**不用** `Intl` 的 `weekday` 字串：測試機與使用者裝置的預設 locale 不保證
 * 是 zh-TW，同一段程式在不同環境會回 `Wed` / `週三` / `三`。改以台北曆日重建成
 * UTC 午夜再取 `getUTCDay()`，星期完全由曆日決定，環境無關。
 */
export function formatTaipeiDay(value: string | Date | null | undefined): string | null {
  const d = toValidDate(value)
  if (!d) return null
  const { year, month, day } = taipeiDateParts(d)
  const weekday = WEEKDAY_ZH[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${month}/${day}（${weekday}）`
}

/**
 * 台北曆日鍵 `YYYY-MM-DD`，供「是不是同一天」的比對用（娃娃車班次頁靠它偵測
 * 跨日殘留的班次）。接受 ISO 字串或 `Date`（後者供取「今天」）。
 *
 * ⚠ 一律走台北時區：UTC 日界比台北早 8 小時，用 `toISOString().slice(0, 10)`
 * 會讓台北時間 00:00–07:59 的班次被算成「昨天」，跨日警示反而在正常班次上誤報。
 */
export function taipeiDayKey(value: string | Date | null | undefined): string | null {
  const d = toValidDate(value)
  if (!d) return null
  const { year, month, day } = taipeiDateParts(d)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
