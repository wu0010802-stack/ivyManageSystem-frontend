/**
 * 管理端接送授權「歷史」範圍的區間上限（純函式，可測、不依賴 Vue）。
 *
 * 後端列表不分頁，`api/pickup_authorizations.py::MAX_RANGE_DAYS` 對起訖相差超過
 * 92 天的查詢回 400；前端先在日期選擇器擋掉，不讓使用者白等一個錯誤。
 */

export const MAX_HISTORY_RANGE_DAYS = 92

const DAY_MS = 86400000

/** 以日曆日（UTC 換算，避開夏令時間）計算 `to - from` 相差幾天。 */
function calendarDayDiff(fromUtc: number, toUtc: number): number {
  return Math.round((toUtc - fromUtc) / DAY_MS)
}

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function dateToUtc(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

/** 起訖（YYYY-MM-DD）相差是否超過上限。 */
export function exceedsHistoryRange(range: [string, string]): boolean {
  return calendarDayDiff(isoToUtc(range[0]), isoToUtc(range[1])) > MAX_HISTORY_RANGE_DAYS
}

/**
 * el-date-picker daterange 的 `disabled-date`：使用者點了起日（`pickedStart`）之後，
 * 離起日超過上限的前後日期都不可選；還沒點起日時不鎖。
 */
export function isBeyondHistoryRange(date: Date, pickedStart: Date | null): boolean {
  if (!pickedStart) return false
  return Math.abs(calendarDayDiff(dateToUtc(pickedStart), dateToUtc(date))) > MAX_HISTORY_RANGE_DAYS
}
