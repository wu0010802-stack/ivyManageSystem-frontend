/**
 * 學年度計算工具。
 * 台灣學制：8/1 起為上學期，2/1 起為下學期，1/31 前仍屬前一學年上學期。
 */

/**
 * 取得當前學年度與學期。
 * @returns {{ school_year: number, semester: number }}
 */
export function getCurrentAcademicTerm() {
  const now = new Date()
  const month = now.getMonth() + 1
  if (month >= 8) return { school_year: now.getFullYear(), semester: 1 }
  if (month >= 2) return { school_year: now.getFullYear() - 1, semester: 2 }
  return { school_year: now.getFullYear() - 1, semester: 1 }
}

/**
 * 將值標準化為學年度數字；若無效則回傳當前學年度。
 * @param {any} value
 * @returns {number}
 */
export function normalizeSchoolYear(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : getCurrentAcademicTerm().school_year
}

/**
 * 產生學年度選項陣列（當前學年度 ±range 年）。
 * @param {number} currentYear - 當前學年度
 * @param {number} [range=5] - 前後各幾年
 * @returns {number[]} 由大到小排列
 */
export function buildSchoolYearOptions(currentYear, range = 5) {
  const years = new Set()
  for (let i = -range; i <= range; i++) {
    years.add(currentYear + i)
  }
  return Array.from(years).sort((a, b) => b - a)
}
