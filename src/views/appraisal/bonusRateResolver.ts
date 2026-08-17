// bonusRateResolver.ts — 前端版「查對應獎金率」，比照後端
// services/appraisal/engine.py::compute_bonus_amount 的查表邏輯（docstring：
// base 從 bonus_rates 查 (role_group, grade, effective_from ≤ on_date) 的最大
// 那筆）。純顯示用途，不影響任何實際計算或寫入——bonus_amount 本身已是後端
// 算好存進 AppraisalSummary 的既有欄位，這裡只是重現「怎麼算出來的」給使用者看。

export interface BonusRateRow {
  id: number
  effective_from: string
  role_group: string
  grade: string
  base_amount: number | string
}

export interface BonusRateMatch {
  baseAmount: number
  effectiveFrom: string
}

export function resolveBonusRate(
  rates: BonusRateRow[],
  roleGroup: string,
  grade: string,
  onDate: string,
): BonusRateMatch | null {
  const candidates = rates.filter(
    (r) => r.role_group === roleGroup && r.grade === grade && r.effective_from <= onDate,
  )
  if (candidates.length === 0) return null
  const latest = candidates.reduce((a, b) => (b.effective_from > a.effective_from ? b : a))
  const baseAmount = Number(latest.base_amount)
  if (Number.isNaN(baseAmount) || baseAmount <= 0) return null
  return { baseAmount, effectiveFrom: latest.effective_from }
}

// 對齊後端 _NO_BONUS_GRADES（engine.py:47）：PASS/WARN/FAIL 無獎金，計算軌跡
// 區塊遇到這三個等第時不查表、直接顯示「此等第無獎金」。
export const NO_BONUS_GRADES = new Set(['PASS', 'WARN', 'FAIL'])
