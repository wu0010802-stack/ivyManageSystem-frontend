import { describe, it, expect } from 'vitest'
import {
  festivalCoverageLabel,
  parseYearMonth,
  festivalBatchForSalaryMonth,
  isFestivalPayoutMonth,
  festivalCoverageLabelForSalaryMonth,
  festivalPayoutMonthsInYear,
  festivalPayoutMonthsText,
} from '../festivalCoverage'

describe('festivalCoverageLabel — 節慶獎金發放月涵蓋的累積月份', () => {
  // 對齊後端 services/salary/utils.get_distribution_period_months：
  // 2月發(12-1月)、6月發(2-5月)、9月發(6-8月)、12月發(9-11月)
  it('發放月回傳對應涵蓋區間文字', () => {
    expect(festivalCoverageLabel(2)).toBe('12～1 月')
    expect(festivalCoverageLabel(6)).toBe('2～5 月')
    expect(festivalCoverageLabel(9)).toBe('6～8 月')
    expect(festivalCoverageLabel(12)).toBe('9～11 月')
  })

  it('非發放月一律回 null（不顯示涵蓋區間）', () => {
    for (const m of [1, 3, 4, 5, 7, 8, 10, 11]) {
      expect(festivalCoverageLabel(m)).toBeNull()
    }
  })

  it('超出 1-12 範圍或非整數輸入安全回 null', () => {
    expect(festivalCoverageLabel(0)).toBeNull()
    expect(festivalCoverageLabel(13)).toBeNull()
    expect(festivalCoverageLabel(NaN)).toBeNull()
  })
})

describe('parseYearMonth', () => {
  it('合法 YYYY-MM 解析為 [年, 月]', () => {
    expect(parseYearMonth('2026-11')).toEqual([2026, 11])
    expect(parseYearMonth(' 2027-01 ')).toEqual([2027, 1])
  })
  it('空值或格式錯誤回 null', () => {
    expect(parseYearMonth(null)).toBeNull()
    expect(parseYearMonth(undefined)).toBeNull()
    expect(parseYearMonth('')).toBeNull()
    expect(parseYearMonth('2026-13')).toBeNull()
    expect(parseYearMonth('2026-1')).toBeNull()
    expect(parseYearMonth('2026/11')).toBeNull()
  })
})

describe('festivalBatchForSalaryMonth — 對齊後端 FestivalPayoutPolicy.batch_for_salary_month', () => {
  it('未設定前移：發放月為 2/6/9/12，批次即該月', () => {
    expect(festivalPayoutMonthsInYear(2026, null)).toEqual([2, 6, 9, 12])
    expect(festivalBatchForSalaryMonth(2026, 12, null)).toEqual([2026, 12])
    expect(festivalBatchForSalaryMonth(2026, 11, null)).toBeNull()
  })

  it('前移全面生效：發放月為 1/5/8/11，1 月發的是同年 2 月批（12–1 月）', () => {
    expect(festivalPayoutMonthsInYear(2027, '2026-01')).toEqual([1, 5, 8, 11])
    expect(festivalBatchForSalaryMonth(2027, 1, '2026-01')).toEqual([2027, 2])
    expect(festivalBatchForSalaryMonth(2027, 11, '2026-01')).toEqual([2027, 12])
    expect(festivalBatchForSalaryMonth(2027, 12, '2026-01')).toBeNull()
    expect(festivalBatchForSalaryMonth(2027, 2, '2026-01')).toBeNull()
  })

  it('切換年：E=2026-11 時 9 月批（期間止於 8 月）照舊 9 月發，12 月批改 11 月發', () => {
    expect(festivalPayoutMonthsInYear(2026, '2026-11')).toEqual([2, 6, 9, 11])
    expect(festivalBatchForSalaryMonth(2026, 9, '2026-11')).toEqual([2026, 9])
    expect(festivalBatchForSalaryMonth(2026, 11, '2026-11')).toEqual([2026, 12])
    expect(festivalBatchForSalaryMonth(2026, 12, '2026-11')).toBeNull()
  })

  it('E 落在期間中段（2026-10）：12 月批最後期間月 11 ≥ 10 → 前移到 11 月，每批恰好發一次', () => {
    const months = [
      ...festivalPayoutMonthsInYear(2026, '2026-10').map((m) => `2026-${m}`),
      ...festivalPayoutMonthsInYear(2027, '2026-10').map((m) => `2027-${m}`),
    ]
    expect(months).toEqual(['2026-2', '2026-6', '2026-9', '2026-11', '2027-1', '2027-5', '2027-8', '2027-11'])
  })

  it('非法月份安全回 null', () => {
    expect(festivalBatchForSalaryMonth(2026, 0, null)).toBeNull()
    expect(festivalBatchForSalaryMonth(2026, 13, null)).toBeNull()
    expect(isFestivalPayoutMonth(2026, NaN, null)).toBe(false)
  })

  it('格式錯誤的設定值視為未設定（標準口徑）', () => {
    expect(festivalPayoutMonthsInYear(2026, 'bad')).toEqual([2, 6, 9, 12])
  })
})

describe('festivalCoverageLabelForSalaryMonth / festivalPayoutMonthsText', () => {
  it('前移後 5 月發 2～5 月、1 月發 12～1 月', () => {
    expect(festivalCoverageLabelForSalaryMonth(2027, 5, '2026-01')).toBe('2～5 月')
    expect(festivalCoverageLabelForSalaryMonth(2027, 1, '2026-01')).toBe('12～1 月')
    expect(festivalCoverageLabelForSalaryMonth(2027, 6, '2026-01')).toBeNull()
  })
  it('標準口徑文字', () => {
    expect(festivalPayoutMonthsText(2026, null)).toBe('2／6／9／12 月')
    expect(festivalPayoutMonthsText(2027, '2026-01')).toBe('1／5／8／11 月')
  })
})
