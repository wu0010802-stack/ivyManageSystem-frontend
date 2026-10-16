/**
 * 學年度計算工具。
 * 台灣學制：8/1 起為上學期，2/1 起為下學期，1/31 前仍屬前一學年上學期。
 */

import { dateToLocalISO } from '@/utils/format'

/** 西元年與民國年的差值（民國元年 = 西元 1912）。 */
export const ROC_OFFSET = 1911

/** 西元年 → 民國年 / 學年度（adYear - 1911）。例：2025 → 114。 */
export function toRocYear(adYear: number): number {
  return adYear - ROC_OFFSET
}

/** 民國年 / 學年度 → 西元年（rocYear + 1911）。例：114 → 2025。 */
export function toAdYear(rocYear: number): number {
  return rocYear + ROC_OFFSET
}

/** 當前西元年對應的民國學年度。 */
export function currentRocYear(): number {
  return toRocYear(new Date().getFullYear())
}

/**
 * 容錯轉換：值看起來是西元年（> 1911）才轉民國年；否則視為「已是民國年」原樣回傳。
 * 用於來源可能是 AD 或 ROC 的欄位（如後端有時回西元、有時回學年度）。
 */
export function coerceRocYear(value: number): number {
  return value > ROC_OFFSET ? toRocYear(value) : value
}

/**
 * 取得當前學年度與學期。
 * @returns {{ school_year: number, semester: number }}
 */
export function getCurrentAcademicTerm() {
  const now = new Date()
  const month = now.getMonth() + 1
  if (month >= 8) return { school_year: toRocYear(now.getFullYear()), semester: 1 }
  if (month >= 2) return { school_year: toRocYear(now.getFullYear() - 1), semester: 2 }
  return { school_year: toRocYear(now.getFullYear() - 1), semester: 1 }
}

/**
 * 將值標準化為學年度數字；若無效則回傳當前學年度。
 * @param {any} value
 * @returns {number}
 */
export function normalizeSchoolYear(value: unknown) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : getCurrentAcademicTerm().school_year
}

/**
 * 產生學年度選項陣列（當前學年度 ±range 年）。
 * @param {number} currentYear - 當前學年度
 * @param {number} [range=5] - 前後各幾年
 * @returns {number[]} 由大到小排列
 */
export function buildSchoolYearOptions(currentYear: number, range = 5) {
  const years = new Set<number>()
  for (let i = -range; i <= range; i++) {
    years.add(currentYear + i)
  }
  return Array.from(years).sort((a, b) => b - a)
}

/**
 * 學年學期 → 日曆日期區間 `[from, to]`（皆為 `YYYY-MM-DD`）。
 *
 * 上學期＝該學年 8/1 至隔年 1/31；下學期＝隔年 2/1 至 7/31。
 * 進行中的學期把結束日截到今天——帳本不會有未來的異動，區間拉到學期末只是空白。
 * 尚未開始的學期不截斷，否則 `to` 會早於 `from`、成為顛倒區間。
 *
 * ⚠ 一律用 `dateToLocalISO`，不可 `toISOString()`：後者是 UTC，
 * 台北（UTC+8）早上 8 點前會取到前一天。
 */
export function getTermDateRange(
  schoolYear: number,
  semester: number,
  now: Date = new Date(),
): [string, string] {
  const adYear = toAdYear(schoolYear)
  const start =
    semester === 1 ? new Date(adYear, 7, 1) : new Date(adYear + 1, 1, 1)
  const end =
    semester === 1 ? new Date(adYear + 1, 0, 31) : new Date(adYear + 1, 6, 31)
  const to = now >= start && now < end ? now : end
  return [dateToLocalISO(start), dateToLocalISO(to)]
}
