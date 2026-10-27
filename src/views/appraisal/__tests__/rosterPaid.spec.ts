import { describe, it, expect } from 'vitest'
import {
  isPayoutExistsConflict,
  payoutVoidLocation,
  payoutYearForCycle,
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

describe('payoutYearForCycle / payoutVoidLocation', () => {
  it('考核週期學年換成年終發放年：113 學年 → 2026（發放年 − 1913 = 來源學年）', () => {
    expect(payoutYearForCycle(113)).toBe(2026)
    expect(payoutYearForCycle(114)).toBe(2027)
  })

  it('作廢入口帶上發放年；缺學年時不帶 query', () => {
    expect(payoutVoidLocation({ academic_year: 113 })).toEqual({
      path: '/year-end/appraisal-payout',
      query: { year: '2026' },
    })
    expect(payoutVoidLocation({})).toEqual({ path: '/year-end/appraisal-payout' })
  })
})

describe('isPayoutExistsConflict', () => {
  const err = (status: number) => ({ response: { status } })

  it('409 且說明要求先作廢：是', () => {
    expect(
      isPayoutExistsConflict(err(409), '此半年的考核年終獎金明細已在年終產生（或已匯入），請先到「考核年終獎金」頁作廢該年度的明細後再標記'),
    ).toBe(true)
  })

  it('其他 409（已標記、狀態不對）不是，不該引導去作廢', () => {
    expect(isPayoutExistsConflict(err(409), '此週期已標記考核名冊已發放')).toBe(false)
    expect(isPayoutExistsConflict(err(409), '週期狀態為 OPEN，僅已封存（CLOSED）的週期可標記考核名冊已發放')).toBe(false)
  })

  it('非 409、沒有 response 都不是', () => {
    expect(isPayoutExistsConflict(err(403), '請先作廢')).toBe(false)
    expect(isPayoutExistsConflict(null, '請先作廢')).toBe(false)
    expect(isPayoutExistsConflict(new Error('x'), '請先作廢')).toBe(false)
  })
})
