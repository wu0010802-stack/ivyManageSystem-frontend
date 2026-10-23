import { describe, it, expect } from 'vitest'
import {
  adjustmentStatusLabel,
  adjustmentStatusTag,
  buildCycleRulesPatch,
  deductionPeriodLabel,
  diffDirection,
  diffDirectionLabel,
  employeeNames,
  summarizePendingAdjustments,
  toAmount,
} from '../yearEnd0315'

describe('toAmount（Decimal 字串）', () => {
  it('字串／數字／空值', () => {
    expect(toAmount('1234.50')).toBe(1234.5)
    expect(toAmount('-500')).toBe(-500)
    expect(toAmount(12)).toBe(12)
    expect(toAmount(null)).toBe(0)
    expect(toAmount('abc')).toBe(0)
  })
})

describe('差額方向', () => {
  it('正＝待表外補發、負＝待人工追回、0＝無差額', () => {
    expect(diffDirection('300.00')).toBe('payout')
    expect(diffDirection('-120')).toBe('recovery')
    expect(diffDirection('0.00')).toBe('none')
    expect(diffDirectionLabel('300')).toBe('待表外補發')
    expect(diffDirectionLabel('-1')).toBe('待人工追回')
  })
})

describe('狀態標籤', () => {
  it('三態中文與 tag 色', () => {
    expect(adjustmentStatusLabel('PENDING')).toBe('待處理')
    expect(adjustmentStatusLabel('SETTLED')).toBe('已處理')
    expect(adjustmentStatusLabel('WAIVED')).toBe('免追／免補')
    expect(adjustmentStatusTag('PENDING')).toBe('warning')
    expect(adjustmentStatusLabel('UNKNOWN')).toBe('UNKNOWN')
    expect(adjustmentStatusTag('UNKNOWN')).toBe('info')
  })
})

describe('summarizePendingAdjustments', () => {
  it('只彙總 PENDING；補發與追回分開、追回取絕對值', () => {
    expect(
      summarizePendingAdjustments([
        { diff_amount: '500', status: 'PENDING' },
        { diff_amount: '-200.5', status: 'PENDING' },
        { diff_amount: '999', status: 'SETTLED' },
        { diff_amount: '-50', status: 'WAIVED' },
        { diff_amount: '0', status: 'PENDING' },
      ]),
    ).toEqual({ pendingCount: 3, pendingPayout: 500, pendingRecovery: 200.5 })
  })
})

describe('deductionPeriodLabel', () => {
  it('1＝曆年；2＝2 月～隔年 1 月', () => {
    expect(deductionPeriodLabel(1)).toBe('曆年 1–12 月')
    expect(deductionPeriodLabel(2)).toBe('2 月～隔年 1 月')
    expect(deductionPeriodLabel(null)).toBe('曆年 1–12 月')
  })
})

describe('buildCycleRulesPatch（只送有改的欄位）', () => {
  const orig = { deduction_period_start_month: 1, employment_cutoff_date: null }

  it('無變更回 null', () => {
    expect(buildCycleRulesPatch(orig, { ...orig })).toBeNull()
    // 空字串與 null 視為同一個「未設定」
    expect(buildCycleRulesPatch(orig, { ...orig, employment_cutoff_date: '' })).toBeNull()
  })

  it('只改起始月', () => {
    expect(buildCycleRulesPatch(orig, { ...orig, deduction_period_start_month: 2 })).toEqual({
      deduction_period_start_month: 2,
    })
  })

  it('設定與清除基準日（清除送 null）', () => {
    expect(buildCycleRulesPatch(orig, { ...orig, employment_cutoff_date: '2026-01-31' })).toEqual({
      employment_cutoff_date: '2026-01-31',
    })
    expect(
      buildCycleRulesPatch(
        { deduction_period_start_month: 2, employment_cutoff_date: '2026-01-31' },
        { deduction_period_start_month: 2, employment_cutoff_date: null },
      ),
    ).toEqual({ employment_cutoff_date: null })
  })
})

describe('employeeNames', () => {
  it('查無名稱顯示 #id', () => {
    const m = new Map([[1, '王小明']])
    expect(employeeNames([1, 9], m)).toEqual(['王小明', '#9'])
  })
})
