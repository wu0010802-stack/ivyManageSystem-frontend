import { describe, it, expect } from 'vitest'
import { leaveCreateLink, parseLeaveCreateQuery, stripLeaveCreateQuery } from '../leaveDeepLink'

describe('請假頁「帶人帶日期新增假單」深連結', () => {
  it('組出的連結解得回同一個人與日期', () => {
    const link = leaveCreateLink(12, '2026-09-15')
    expect(link).toEqual({ path: '/leaves', query: { create: '1', employee_id: '12', date: '2026-09-15' } })
    expect(parseLeaveCreateQuery(link.query)).toEqual({ employeeId: 12, date: '2026-09-15' })
  })

  it('缺參數、格式不對就不開（避免網址被亂改時開出錯的假單）', () => {
    expect(parseLeaveCreateQuery(undefined)).toBeNull()
    expect(parseLeaveCreateQuery({})).toBeNull()
    expect(parseLeaveCreateQuery({ create: '1', employee_id: '12' })).toBeNull()
    expect(parseLeaveCreateQuery({ create: '1', employee_id: 'abc', date: '2026-09-15' })).toBeNull()
    expect(parseLeaveCreateQuery({ create: '1', employee_id: '0', date: '2026-09-15' })).toBeNull()
    expect(parseLeaveCreateQuery({ create: '1', employee_id: '12', date: '2026/09/15' })).toBeNull()
    expect(parseLeaveCreateQuery({ create: '0', employee_id: '12', date: '2026-09-15' })).toBeNull()
    // 重複參數取第一個
    expect(parseLeaveCreateQuery({ create: ['1', '0'], employee_id: ['12'], date: ['2026-09-15'] })).toEqual({ employeeId: 12, date: '2026-09-15' })
  })

  it('開完對話框要把這三個參數拿掉（重新整理不會再開一次），其他參數保留', () => {
    expect(stripLeaveCreateQuery({ create: '1', employee_id: '12', date: '2026-09-15', search: '王' })).toEqual({ search: '王' })
  })
})
