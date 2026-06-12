/**
 * 日期區間捷徑的純函式（el-date-picker shortcuts 用）。
 *
 * 一律走 `dateToLocalISO`（本地時區），不可用 `toISOString().slice(0, 10)`：
 * 那會轉成 UTC，台北 UTC+8 在凌晨 0~8 點會偏成昨天；
 * 「本月 1 號」這種本地午夜的 Date 更是任何時刻都會偏成上月最後一天。
 */
import { dateToLocalISO } from '@/utils/format'

export type DateRangeISO = [string, string]

// 今天
export function todayRange(now: Date = new Date()): DateRangeISO {
  const iso = dateToLocalISO(now)
  return [iso, iso]
}

// 本週（週一起算）
export function thisWeekRange(now: Date = new Date()): DateRangeISO {
  const day = now.getDay() || 7
  const start = new Date(now)
  start.setDate(now.getDate() - day + 1)
  return [dateToLocalISO(start), dateToLocalISO(now)]
}

// 本月（1 號起）
export function thisMonthRange(now: Date = new Date()): DateRangeISO {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return [dateToLocalISO(start), dateToLocalISO(now)]
}

// 近 N 天
export function lastNDaysRange(days: number, now: Date = new Date()): DateRangeISO {
  const start = new Date(now)
  start.setDate(now.getDate() - days)
  return [dateToLocalISO(start), dateToLocalISO(now)]
}
