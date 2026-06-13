import { describe, it, expect } from 'vitest'
import { festivalCoverageLabel } from '../festivalCoverage'

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
