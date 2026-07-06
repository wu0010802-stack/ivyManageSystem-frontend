/**
 * G15（園方福利辦法 115.01.01）紅利才藝參與率逐年級門檻的 fraction ↔ 百分比換算。
 *
 * 後端 BonusConfig.dividend_activity_grade_thresholds 存 fraction（0~1，如 0.96）；
 * 編輯 UI 顯示為百分比（0~100，如 96）方便行政人員輸入。任一年級留空＝該年級沿用
 * 單一門檻 dividend_activity_threshold；四個年級都留空 → 送出 null（整組回退）。
 */

export const DIVIDEND_ACTIVITY_GRADES = ['大班', '中班', '小班', '幼幼班'] as const
export type DividendActivityGrade = (typeof DIVIDEND_ACTIVITY_GRADES)[number]
export type GradeThresholdPercents = Record<DividendActivityGrade, number | null>

/** fraction（0~1）→ 百分比（0~100），四捨五入到 2 位小數避免浮點誤差（如 0.96*100 → 95.99999999999999）。 */
export function fractionToPercent(fraction: number): number {
  return Math.round(fraction * 100 * 100) / 100
}

/** 百分比（0~100）→ fraction（0~1），四捨五入到 4 位小數避免浮點誤差。 */
export function percentToFraction(percent: number): number {
  return Math.round((percent / 100) * 10000) / 10000
}

/** 建立全部年級皆未設定（null）的初始 record。 */
export function emptyGradeThresholdPercents(): GradeThresholdPercents {
  const result = {} as GradeThresholdPercents
  for (const grade of DIVIDEND_ACTIVITY_GRADES) {
    result[grade] = null
  }
  return result
}

/** 後端 dict（年級名→fraction）→ 編輯用百分比 record；缺值/null/undefined 一律視為未設定。 */
export function gradeThresholdsFromApi(
  dict: Record<string, number> | null | undefined,
): GradeThresholdPercents {
  const result = emptyGradeThresholdPercents()
  for (const grade of DIVIDEND_ACTIVITY_GRADES) {
    const v = dict?.[grade]
    result[grade] = typeof v === 'number' ? fractionToPercent(v) : null
  }
  return result
}

/** 編輯用百分比 record → 後端 dict；全部留空 → null（回退單一門檻）。 */
export function gradeThresholdsToApi(
  percents: GradeThresholdPercents,
): Record<string, number> | null {
  const result: Record<string, number> = {}
  for (const grade of DIVIDEND_ACTIVITY_GRADES) {
    const v = percents[grade]
    if (v !== null && v !== undefined) {
      result[grade] = percentToFraction(v)
    }
  }
  return Object.keys(result).length > 0 ? result : null
}
