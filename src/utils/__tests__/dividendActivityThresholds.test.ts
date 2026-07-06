import { describe, it, expect } from 'vitest'
import {
  DIVIDEND_ACTIVITY_GRADES,
  emptyGradeThresholdPercents,
  fractionToPercent,
  percentToFraction,
  gradeThresholdsFromApi,
  gradeThresholdsToApi,
} from '../dividendActivityThresholds'

describe('dividendActivityThresholds', () => {
  describe('fractionToPercent / percentToFraction', () => {
    it('0.96 → 96（避開浮點誤差 95.99999999999999）', () => {
      expect(fractionToPercent(0.96)).toBe(96)
    })

    it('96 → 0.96（避開浮點誤差 0.9600000000000001）', () => {
      expect(percentToFraction(96)).toBe(0.96)
    })

    it('往返：fraction → percent → fraction 不失真', () => {
      for (const fraction of [1, 0.9, 0.8, 0.7, 0.855]) {
        expect(percentToFraction(fractionToPercent(fraction))).toBe(fraction)
      }
    })

    it('0 與 1 邊界值', () => {
      expect(fractionToPercent(0)).toBe(0)
      expect(fractionToPercent(1)).toBe(100)
      expect(percentToFraction(0)).toBe(0)
      expect(percentToFraction(100)).toBe(1)
    })
  })

  describe('emptyGradeThresholdPercents', () => {
    it('四個年級皆為 null', () => {
      const result = emptyGradeThresholdPercents()
      for (const grade of DIVIDEND_ACTIVITY_GRADES) {
        expect(result[grade]).toBeNull()
      }
    })
  })

  describe('gradeThresholdsFromApi', () => {
    it('後端 dict 完整 → 四年級皆換算為百分比', () => {
      const result = gradeThresholdsFromApi({
        大班: 1.0,
        中班: 0.9,
        小班: 0.8,
        幼幼班: 0.7,
      })
      expect(result).toEqual({ 大班: 100, 中班: 90, 小班: 80, 幼幼班: 70 })
    })

    it('null → 四年級皆 null（未設定）', () => {
      expect(gradeThresholdsFromApi(null)).toEqual(emptyGradeThresholdPercents())
    })

    it('undefined → 四年級皆 null（舊後端缺欄位容錯）', () => {
      expect(gradeThresholdsFromApi(undefined)).toEqual(emptyGradeThresholdPercents())
    })

    it('部分年級缺值 → 缺的視為未設定，其餘正常換算', () => {
      const result = gradeThresholdsFromApi({ 大班: 0.96 })
      expect(result).toEqual({ 大班: 96, 中班: null, 小班: null, 幼幼班: null })
    })
  })

  describe('gradeThresholdsToApi', () => {
    it('四年級皆有值 → 換算回 fraction dict', () => {
      const result = gradeThresholdsToApi({ 大班: 100, 中班: 90, 小班: 80, 幼幼班: 70 })
      expect(result).toEqual({ 大班: 1, 中班: 0.9, 小班: 0.8, 幼幼班: 0.7 })
    })

    it('整組清空（四年級皆 null）→ null（回退單一門檻）', () => {
      const result = gradeThresholdsToApi(emptyGradeThresholdPercents())
      expect(result).toBeNull()
    })

    it('部分年級清空 → dict 只含有值年級，其餘略過（未設定之年級沿用單一門檻）', () => {
      const result = gradeThresholdsToApi({ 大班: 96, 中班: null, 小班: null, 幼幼班: null })
      expect(result).toEqual({ 大班: 0.96 })
    })
  })
})
