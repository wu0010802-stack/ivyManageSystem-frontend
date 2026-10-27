import { describe, it, expect } from 'vitest'
import {
  defaultSemester2AcademicYear,
  semester2PeriodLabel,
  sortedMonthEntries,
  applyResultCountsText,
  coexistConfirmNote,
  coexistCount,
  removalDescriptionParts,
  removedBriefsText,
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

describe('applyResultCountsText — 移除列（人工優先、去重）', () => {
  const brief = (n: string, amount = 0) => ({ employee_name: n, amount })
  const base = { created: [], updated: [], deleted: [], skipped_manual: [], skipped_self: [], total_amount: 0 }

  it('因人工登錄移除、去除重複各自列出筆數', () => {
    expect(
      applyResultCountsText({
        ...base,
        removed_for_manual: [brief('a', 1200)],
        removed_duplicates: [brief('b', 800), brief('c', 800)],
      }),
    ).toBe('新增 0 位、更新 0 位、移除 0 位、因人工登錄移除系統列 1 位、去除重複系統列 2 位')
  })

  it('舊後端沒有這兩欄、或為空陣列時不多寫', () => {
    expect(applyResultCountsText(base)).toBe('新增 0 位、更新 0 位、移除 0 位')
    expect(applyResultCountsText({ ...base, removed_for_manual: [], removed_duplicates: [] })).toBe(
      '新增 0 位、更新 0 位、移除 0 位',
    )
  })
})

describe('removedBriefsText / removalDescriptionParts', () => {
  it('姓名後面接被移除那筆的金額，讓承辦人核對', () => {
    expect(removedBriefsText([{ employee_name: '王老師', amount: 1200 }, { employee_name: '李老師', amount: 800 }])).toBe(
      '王老師 NT$1,200、李老師 NT$800',
    )
  })

  it('沒有金額時只列姓名', () => {
    expect(removedBriefsText([{ employee_name: '王老師' }])).toBe('王老師')
  })

  it('兩種移除各自一句，說明原因；都沒有回空陣列', () => {
    expect(removalDescriptionParts({})).toEqual([])
    const parts = removalDescriptionParts({
      removed_for_manual: [{ employee_name: '王老師', amount: 1200 }],
      removed_duplicates: [{ employee_name: '李老師', amount: 800 }],
    })
    expect(parts).toEqual([
      '已有人工登錄，已移除系統產生的重複列：王老師 NT$1,200',
      '重複的系統產生列已去除（保留最早一筆）：李老師 NT$800',
    ])
  })

  it('可自訂姓名顯示（才藝批次用來加類別）', () => {
    const [text] = removalDescriptionParts(
      { removed_for_manual: [{ employee_name: '王老師', amount: 100, category: 'x' }] },
      (b) => `${b.employee_name}（${b.category}）`,
    )
    expect(text).toContain('王老師（x） NT$100')
  })
})

describe('coexistCount / coexistConfirmNote', () => {
  it('只算 auto_and_manual_coexist 為 true 的列；缺欄位（舊後端）不算', () => {
    expect(coexistCount([{ auto_and_manual_coexist: true }, { auto_and_manual_coexist: false }, {}])).toBe(1)
  })

  it('有並存時提醒系統列會被移除；沒有時不多一句', () => {
    expect(coexistConfirmNote(0)).toBe('')
    const note = coexistConfirmNote(2)
    expect(note).toContain('2 位')
    expect(note).toContain('移除系統列')
  })
})
