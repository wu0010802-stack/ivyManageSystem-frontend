import { describe, it, expect } from 'vitest'
import {
  defaultSemester2AcademicYear,
  semester2PeriodLabel,
  sortedMonthEntries,
  applyResultCountsText,
} from '../semester2Excess'

describe('defaultSemester2AcademicYear — 最近一個已開始的下學期', () => {
  it('2026-10（上學期進行中）→ 114 學年（115 年 2–7 月）', () => {
    expect(defaultSemester2AcademicYear(new Date(2026, 9, 23))).toBe(114)
  })
  it('2027-03（下學期進行中）→ 115 學年', () => {
    expect(defaultSemester2AcademicYear(new Date(2027, 2, 1))).toBe(115)
  })
  it('2027-01（下學期尚未開始）→ 115 學年（下一個要結算的仍是 115）', () => {
    expect(defaultSemester2AcademicYear(new Date(2027, 0, 15))).toBe(115)
  })
})

describe('semester2PeriodLabel', () => {
  it('115 學年下學期＝116 年 2–7 月', () => {
    expect(semester2PeriodLabel(115)).toBe('116 年 2–7 月')
  })
})

describe('sortedMonthEntries', () => {
  it('依年月排序，空值回空陣列', () => {
    expect(sortedMonthEntries({ '116-03': '200', '116-02': '100' })).toEqual([
      { ym: '116-02', value: '100' },
      { ym: '116-03', value: '200' },
    ])
    expect(sortedMonthEntries(null)).toEqual([])
  })
})

describe('applyResultCountsText', () => {
  const brief = (n: string) => ({ employee_name: n })
  it('只在有跳過時才列出跳過項', () => {
    expect(
      applyResultCountsText({ created: [brief('a')], updated: [], deleted: [], skipped_manual: [], skipped_self: [], total_amount: 0 }),
    ).toBe('新增 1 位、更新 0 位、移除 0 位')
    expect(
      applyResultCountsText({
        created: [],
        updated: [brief('a'), brief('b')],
        deleted: [brief('c')],
        skipped_manual: [brief('d')],
        skipped_self: [brief('e')],
        total_amount: 0,
      }),
    ).toBe('新增 0 位、更新 2 位、移除 1 位、已有人工登錄跳過 1 位、本人須由他人執行 1 位')
  })
})
