import { describe, it, expect } from 'vitest'
import {
  canMarkRosterPaid,
  canUnmarkRosterPaid,
  isRosterPaid,
  markRosterPaidMessage,
  rosterPaidSummary,
  type RosterPaidCycleLike,
} from '../rosterPaid'

const closed: RosterPaidCycleLike = {
  academic_year: 114,
  semester: 'SECOND',
  status: 'CLOSED',
  roster_paid_at: null,
  roster_paid_by: null,
  roster_paid_note: null,
}
const paid: RosterPaidCycleLike = {
  ...closed,
  roster_paid_at: '2026-10-27T15:30:00+08:00',
  roster_paid_by: 'finance01',
  roster_paid_note: '115/02 名冊轉帳',
}

describe('isRosterPaid', () => {
  it('以 roster_paid_at 是否有值判斷；舊後端缺欄位視為未標記', () => {
    expect(isRosterPaid(paid)).toBe(true)
    expect(isRosterPaid(closed)).toBe(false)
    expect(isRosterPaid({ status: 'CLOSED' })).toBe(false)
    expect(isRosterPaid(null)).toBe(false)
  })
})

describe('canMarkRosterPaid', () => {
  it('只有已封存（CLOSED）、尚未標記、且有會計核數字權限才能標記', () => {
    expect(canMarkRosterPaid(closed, true)).toBe(true)
  })

  it.each(['OPEN', 'LOCKED'])('週期狀態 %s 不能標記（後端會回 409）', (status) => {
    expect(canMarkRosterPaid({ ...closed, status }, true)).toBe(false)
  })

  it('已標記過就不再顯示標記入口', () => {
    expect(canMarkRosterPaid(paid, true)).toBe(false)
  })

  it('沒有權限不能標記；週期尚未載入也不能', () => {
    expect(canMarkRosterPaid(closed, false)).toBe(false)
    expect(canMarkRosterPaid(null, true)).toBe(false)
  })
})

describe('canUnmarkRosterPaid', () => {
  it('已標記且有權限才能取消', () => {
    expect(canUnmarkRosterPaid(paid, true)).toBe(true)
    expect(canUnmarkRosterPaid(paid, false)).toBe(false)
    expect(canUnmarkRosterPaid(closed, true)).toBe(false)
    expect(canUnmarkRosterPaid(null, true)).toBe(false)
  })
})

describe('rosterPaidSummary', () => {
  it('顯示台北時間到分鐘、標記人與備註', () => {
    expect(rosterPaidSummary(paid)).toBe(
      '名冊已發放：2026-10-27 15:30 由 finance01 標記（115/02 名冊轉帳）',
    )
  })

  it('UTC 時間字串換算成台北時間', () => {
    expect(rosterPaidSummary({ ...paid, roster_paid_at: '2026-10-27T07:30:00Z' })).toContain('2026-10-27 15:30')
  })

  it('沒有備註、沒有標記人時不留空括號或「由」', () => {
    expect(rosterPaidSummary({ ...paid, roster_paid_by: null, roster_paid_note: '' })).toBe(
      '名冊已發放：2026-10-27 15:30',
    )
    expect(rosterPaidSummary({ ...paid, roster_paid_note: null })).toBe(
      '名冊已發放：2026-10-27 15:30 由 finance01 標記',
    )
  })

  it('未標記回空字串', () => {
    expect(rosterPaidSummary(closed)).toBe('')
  })
})

describe('markRosterPaidMessage', () => {
  it('說明哪個學期，以及年終不會再產生該半年明細、已產生的不會自動刪除', () => {
    const text = markRosterPaidMessage(closed)
    expect(text).toContain('114 學年下學期')
    expect(text).toContain('不會再')
    expect(text).toContain('不會自動刪除')
  })

  it('上學期的文案', () => {
    expect(markRosterPaidMessage({ ...closed, semester: 'FIRST' })).toContain('114 學年上學期')
  })
})
