import { describe, it, expect } from 'vitest'
import { validateMeetingWindow, describeShiftHours, formatMeetingHours } from '../meetingWindow'

describe('validateMeetingWindow（mtgshift01：會議時段兩欄配對）', () => {
  it('兩欄皆空＝停用，合法', () => {
    expect(validateMeetingWindow('', '')).toBeNull()
    expect(validateMeetingWindow(null, null)).toBeNull()
  })

  it('有開始也有結束、結束較晚＝合法', () => {
    expect(validateMeetingWindow('17:30', '18:30')).toBeNull()
  })

  it('只填一邊 → 提示同時填寫或清空', () => {
    expect(validateMeetingWindow('17:30', '')).toMatch('同時')
    expect(validateMeetingWindow(null, '18:30')).toMatch('同時')
  })

  it('結束不晚於開始 → 提示', () => {
    expect(validateMeetingWindow('18:30', '17:30')).toMatch('晚於')
    expect(validateMeetingWindow('17:30', '17:30')).toMatch('晚於')
  })
})

describe('describeShiftHours（批次登錄名單上的排班原因）', () => {
  it.each([
    [{ source: 'weekly', shift_end: '18:00' }, '排班 18:00 下班'],
    [{ source: 'daily', shift_end: '18:00' }, '當日調班 18:00 下班'],
    [{ source: 'daily_off', shift_end: null }, '當天排休'],
    [{ source: 'employee', shift_end: '17:30' }, '員工工時 17:30 下班'],
    [{ source: 'default', shift_end: '17:00' }, '未排班（17:00 下班）'],
  ])('%o → %s', (item, expected) => {
    expect(describeShiftHours(item)).toBe(expected)
  })
})

describe('formatMeetingHours', () => {
  it('去掉多餘的小數零', () => {
    expect(formatMeetingHours(1)).toBe('1')
    expect(formatMeetingHours(0.5)).toBe('0.5')
    expect(formatMeetingHours(0.33)).toBe('0.33')
    expect(formatMeetingHours(0)).toBe('0')
  })
})
