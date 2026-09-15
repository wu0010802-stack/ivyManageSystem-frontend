import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  daysBetween,
  deadlineHint,
  deriveSurveyStatus,
  filterSurveyRows,
  replyPercent,
  sortSurveyRows,
  type SurveyListRow,
} from '../surveyListModel'

const TODAY = '2026-09-15'

function row(overrides: Partial<SurveyListRow> = {}): SurveyListRow {
  return {
    id: 1,
    title: '秋季戶外教學',
    event_date: '2026-10-01',
    reply_deadline: '2026-09-20',
    audience_type: 'all',
    status: 'published',
    replied_count: 10,
    denominator: 40,
    ...overrides,
  }
}

describe('deriveSurveyStatus', () => {
  it('draft／closed 原樣對應', () => {
    expect(deriveSurveyStatus(row({ status: 'draft' }), TODAY)).toBe('draft')
    expect(deriveSurveyStatus(row({ status: 'closed' }), TODAY)).toBe('closed')
  })

  it('published 且截止日 >= 今天為 open；含當日', () => {
    expect(deriveSurveyStatus(row({ reply_deadline: '2026-09-20' }), TODAY)).toBe('open')
    expect(deriveSurveyStatus(row({ reply_deadline: TODAY }), TODAY)).toBe('open')
  })

  it('published 但過了截止日為 expired（後端不會自動翻 closed）', () => {
    expect(deriveSurveyStatus(row({ reply_deadline: '2026-09-14' }), TODAY)).toBe('expired')
  })

  it('未知狀態當 closed 處理，不放出寫入動作', () => {
    expect(deriveSurveyStatus(row({ status: 'archived' }), TODAY)).toBe('closed')
  })
})

describe('daysBetween / deadlineHint', () => {
  it('daysBetween 跨月與同日', () => {
    expect(daysBetween('2026-09-15', '2026-10-01')).toBe(16)
    expect(daysBetween('2026-09-15', '2026-09-15')).toBe(0)
    expect(daysBetween('2026-09-15', '2026-09-13')).toBe(-2)
  })

  it('進行中顯示剩餘天數或今天截止', () => {
    expect(deadlineHint(row({ reply_deadline: '2026-09-20' }), TODAY)).toBe('剩 5 天')
    expect(deadlineHint(row({ reply_deadline: TODAY }), TODAY)).toBe('今天截止')
  })

  it('已截止顯示已過天數；草稿與已結束不顯示', () => {
    expect(deadlineHint(row({ reply_deadline: '2026-09-12' }), TODAY)).toBe('已過 3 天')
    expect(deadlineHint(row({ status: 'draft', reply_deadline: '2026-09-12' }), TODAY)).toBe('')
    expect(deadlineHint(row({ status: 'closed' }), TODAY)).toBe('')
  })
})

describe('replyPercent', () => {
  it('四捨五入成整數；分母 0 回 0', () => {
    expect(replyPercent({ replied_count: 10, denominator: 40 })).toBe(25)
    expect(replyPercent({ replied_count: 2, denominator: 3 })).toBe(67)
    expect(replyPercent({ replied_count: 0, denominator: 0 })).toBe(0)
  })
})

describe('sortSurveyRows', () => {
  it('進行中在前（截止近者優先）→ 已截止 → 草稿 → 已結束；同組新的在前', () => {
    const rows = [
      row({ id: 1, status: 'closed' }),
      row({ id: 2, status: 'draft' }),
      row({ id: 3, reply_deadline: '2026-09-30' }),
      row({ id: 4, reply_deadline: '2026-09-16' }),
      row({ id: 5, reply_deadline: '2026-09-10' }),
      row({ id: 6, reply_deadline: '2026-09-12' }),
      row({ id: 7, status: 'draft' }),
      row({ id: 8, status: 'closed' }),
    ]
    expect(sortSurveyRows(rows, TODAY).map((r) => r.id)).toEqual([4, 3, 6, 5, 7, 2, 8, 1])
  })

  it('不改變原陣列', () => {
    const rows = [row({ id: 1, status: 'closed' }), row({ id: 2 })]
    sortSurveyRows(rows, TODAY)
    expect(rows.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('countByStatus / filterSurveyRows', () => {
  const rows = [
    row({ id: 1, status: 'draft', title: '聖誕晚會' }),
    row({ id: 2, reply_deadline: '2026-09-30', title: '秋季戶外教學' }),
    row({ id: 3, reply_deadline: '2026-09-01', title: '親子運動會' }),
    row({ id: 4, status: 'closed', title: '畢業旅行' }),
    row({ id: 5, reply_deadline: '2026-09-18', title: '秋季親子日' }),
  ]

  it('四態各自計數', () => {
    expect(countByStatus(rows, TODAY)).toEqual({ draft: 1, open: 2, expired: 1, closed: 1 })
  })

  it('依顯示狀態篩選', () => {
    expect(filterSurveyRows(rows, { status: 'open' }, TODAY).map((r) => r.id)).toEqual([2, 5])
    expect(filterSurveyRows(rows, { status: 'expired' }, TODAY).map((r) => r.id)).toEqual([3])
    expect(filterSurveyRows(rows, { status: '' }, TODAY)).toHaveLength(5)
  })

  it('標題關鍵字不分大小寫、去頭尾空白，可與狀態併用', () => {
    expect(filterSurveyRows(rows, { search: ' 秋季 ' }, TODAY).map((r) => r.id)).toEqual([2, 5])
    expect(filterSurveyRows(rows, { search: '秋季', status: 'open' }, TODAY).map((r) => r.id)).toEqual([2, 5])
    expect(filterSurveyRows(rows, { search: '不存在' }, TODAY)).toEqual([])
  })
})
