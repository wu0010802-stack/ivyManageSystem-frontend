/**
 * MANUAL_DELTA 類手填分值的輸入上下限。
 *
 * 後端（api/appraisal/score_items.py）以「週期基準日當下有效的 MANUAL_DELTA 規則」
 * rule_config.min_delta／max_delta 驗證，超界回 422；規則可依租戶在規則設定頁修改。
 * 前端以同一份規則（listScoringRules(base_score_calc_date)）為準，
 * 規則未載入、載入失敗或缺值時退回 @/constants/appraisal 的預設常數。
 */
import { MANUAL_DELTA_RANGES } from '@/constants/appraisal'

export type DeltaRange = { min: number; max: number }

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function resolveManualDeltaRanges(
  rulesByCode: Record<string, unknown> | null | undefined,
): Record<string, DeltaRange> {
  const out: Record<string, DeltaRange> = { ...MANUAL_DELTA_RANGES }
  for (const [code, raw] of Object.entries(rulesByCode ?? {})) {
    const rule = raw as { rule_type?: unknown; rule_config?: Record<string, unknown> | null } | null
    if (!rule || rule.rule_type !== 'MANUAL_DELTA') continue
    const min = toNumber(rule.rule_config?.min_delta)
    const max = toNumber(rule.rule_config?.max_delta)
    if (min === null || max === null || min > max) continue
    out[code] = { min, max }
  }
  return out
}
