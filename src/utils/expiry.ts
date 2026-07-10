/**
 * 到期狀態純函式：判斷證照到期日 / 合約結束日等「YYYY-MM-DD」日期字串的到期狀態。
 *
 * 一律以「本地日期」比較（非 UTC epoch）：`dateStr` 若直接丟給 `new Date(dateStr)`，
 * 會被當成 UTC 午夜解析；在台北 UTC+8 時區與用 `new Date()`（本地時間）建的 `today`
 * 做差值時會偏移 8 小時，凌晨時段可能把「今天到期」誤判成 expired。
 * 因此改為手動拆解字串，用本地時區的年月日建構 Date（同 dateRange.ts 既有慣例）。
 */

export type ExpiryKind = 'expired' | 'expiring' | 'ok' | 'none'

export interface ExpiryStatusResult {
  kind: ExpiryKind
  /** 距今天數：none 固定為 null；其餘三態一律回傳 diff（負數＝已逾期天數），供未來畫面（如 Task 5 待辦列）沿用。 */
  days: number | null
}

// 「快到期」視窗：今天起算 30 天內（含邊界）視為 expiring。
const EXPIRING_WINDOW_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

// 將 "YYYY-MM-DD"（可能帶時間尾巴）字串解析成本地時區午夜的 Date；格式不符回 null。
function parseLocalDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(year, month - 1, day)
  // 例如 "2026-13-40" 會被 Date 建構子自動進位成其他月份，視為無效日期。
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

export function expiryStatus(dateStr: string | null | undefined, today: Date = new Date()): ExpiryStatusResult {
  if (!dateStr) return { kind: 'none', days: null }
  const target = parseLocalDate(dateStr)
  if (!target) return { kind: 'none', days: null }

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((target.getTime() - todayMidnight.getTime()) / MS_PER_DAY)

  if (diffDays < 0) return { kind: 'expired', days: diffDays }
  if (diffDays <= EXPIRING_WINDOW_DAYS) return { kind: 'expiring', days: diffDays }
  return { kind: 'ok', days: diffDays }
}
