/** 年終 grid 獎金欄開關（單一來源，元件與測試共用）。 */
export const BONUS_COL_KEYS = [
  'APPRAISAL_HALF_BONUS_FIRST', 'APPRAISAL_HALF_BONUS_SECOND',
  'SEMESTER_DIVIDEND_FIRST', 'SEMESTER_DIVIDEND_SECOND',
  'AFTER_CLASS_AWARD', 'TEACHING_EXTRA',
  'EXCESS_ENROLLMENT', 'FESTIVAL_DIFF', 'CUSTOM',
] as const

export type BonusColKey = (typeof BONUS_COL_KEYS)[number]

const LS_KEY = 'ye-grid-visible-bonus-cols'

/** 讀取使用者勾選要顯示的獎金欄（預設全不顯示——摘要表零橫捲）。 */
export function loadVisibleBonusCols(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((k) => (BONUS_COL_KEYS as readonly string[]).includes(k)) : [])
  } catch {
    return new Set()
  }
}

export function saveVisibleBonusCols(cols: Set<string>): void {
  localStorage.setItem(LS_KEY, JSON.stringify([...cols]))
}
