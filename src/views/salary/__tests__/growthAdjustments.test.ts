import { describe, it, expect } from 'vitest'
import {
  growthPositionLabel,
  schoolYearMonthBounds,
  validateRateSegmentDraft,
  validateDeductionDraft,
  segmentRangeLabel,
  semesterProgressLabels,
  type RateSegmentDraft,
  type DeductionDraft,
} from '../growthAdjustments'

const seg = (over: Partial<RateSegmentDraft> = {}): RateSegmentDraft => ({
  employee_id: 7,
  school_year: 114,
  start_month: '2026-02',
  end_month: '2026-07',
  position_key: 'head_teacher_b',
  note: '',
  ...over,
})

const ded = (over: Partial<DeductionDraft> = {}): DeductionDraft => ({
  employee_id: 7,
  school_year: 114,
  amount: 1000,
  reason: '115.02 警告款不足額結轉',
  ...over,
})

describe('schoolYearMonthBounds', () => {
  it('民國 114 學年＝2025-08～2026-07', () => {
    expect(schoolYearMonthBounds(114)).toEqual({ first: '2025-08', last: '2026-07' })
  })
})

describe('validateRateSegmentDraft（對齊後端 422 條件）', () => {
  it('合法區段回 null', () => {
    expect(validateRateSegmentDraft(seg())).toBeNull()
    expect(validateRateSegmentDraft(seg({ start_month: '2025-08', end_month: '2025-08' }))).toBeNull()
  })

  it('缺員工／職務', () => {
    expect(validateRateSegmentDraft(seg({ employee_id: null }))).toBe('請選擇員工')
    expect(validateRateSegmentDraft(seg({ position_key: '' }))).toBe('請選擇異動期間的職務')
  })

  it('格式錯誤或迄早於起', () => {
    expect(validateRateSegmentDraft(seg({ start_month: '2026-2' }))).toBe('起訖月須為 YYYY-MM')
    expect(validateRateSegmentDraft(seg({ start_month: '2026-05', end_month: '2026-03' }))).toBe('迄月不得早於起月')
  })

  it('超出學年範圍（8 月～次年 7 月）', () => {
    expect(validateRateSegmentDraft(seg({ start_month: '2025-07' }))).toContain('2025-08～2026-07')
    expect(validateRateSegmentDraft(seg({ end_month: '2026-08' }))).toContain('114 學年')
  })
})

describe('validateDeductionDraft', () => {
  it('合法扣抵回 null', () => {
    expect(validateDeductionDraft(ded())).toBeNull()
  })

  it('金額須為正整數', () => {
    expect(validateDeductionDraft(ded({ amount: null }))).toBe('扣抵金額須為大於 0 的整數')
    expect(validateDeductionDraft(ded({ amount: 0 }))).toBe('扣抵金額須為大於 0 的整數')
    expect(validateDeductionDraft(ded({ amount: 10.5 }))).toBe('扣抵金額須為大於 0 的整數')
  })

  it('原因必填且 ≤200 字', () => {
    expect(validateDeductionDraft(ded({ reason: '   ' }))).toBe('請填寫扣抵原因')
    expect(validateDeductionDraft(ded({ reason: 'x'.repeat(201) }))).toBe('扣抵原因最多 200 字')
  })
})

describe('顯示用標籤', () => {
  it('職務 key 轉中文、未知 key 原樣', () => {
    expect(growthPositionLabel('assistant_teacher_a')).toBe('副班導 A 級')
    expect(growthPositionLabel('mystery')).toBe('mystery')
    expect(growthPositionLabel(null)).toBe('—')
  })

  it('區段期間', () => {
    expect(segmentRangeLabel('2026-02', '2026-07')).toBe('2026-02～2026-07')
    expect(segmentRangeLabel('2026-02', '2026-02')).toBe('2026-02')
  })

  it('逐學期實修/應修，封頂時標示計入時數；無契約月數的學期略過', () => {
    expect(
      semesterProgressLabels([
        { semester: 1, actual_hours: 14, credited_hours: 12, required_hours: 12, contract_months: 6 },
        { semester: 2, actual_hours: 7.5, credited_hours: 7.5, required_hours: 12, contract_months: 6 },
      ]),
    ).toEqual(['上 14/12（計 12）', '下 7.5/12'])
    expect(
      semesterProgressLabels([
        { semester: 1, actual_hours: 0, credited_hours: 0, required_hours: 12, contract_months: 0 },
      ]),
    ).toEqual([])
  })
})
