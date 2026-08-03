import { describe, it, expect } from 'vitest'
import {
  formatWeekdaySchedule,
  hasWeekdaySchedule,
  isWeekdayScheduleIncomplete,
  weekdaySchedulesOverlap,
} from '../weekdaySchedule'

describe('formatWeekdaySchedule — 時段字串（含退階顯示）', () => {
  it('星期＋起訖時間齊備 → 完整時段字串', () => {
    expect(
      formatWeekdaySchedule({
        meeting_weekdays: [0, 2],
        meeting_start_time: '16:00',
        meeting_end_time: '17:00',
      }),
    ).toBe('週一、三 16:00–17:00')
  })

  // prod 實例（2026-08-03）：兒童舞蹈A~C 只設了星期沒填時間，
  // 舊行為整串回空字串 → 前台報名頁的時段 chip 靜默消失。
  it('只有星期、沒有時間 → 退階顯示星期', () => {
    expect(
      formatWeekdaySchedule({
        meeting_weekdays: [3],
        meeting_start_time: null,
        meeting_end_time: null,
      }),
    ).toBe('週四')
  })

  it('有星期、只填了起始時間（時間不完整）→ 一樣退階只顯示星期', () => {
    expect(
      formatWeekdaySchedule({
        meeting_weekdays: [3],
        meeting_start_time: '16:00',
        meeting_end_time: null,
      }),
    ).toBe('週四')
  })

  it('只有時間、沒有星期 → 空字串', () => {
    expect(
      formatWeekdaySchedule({
        meeting_weekdays: [],
        meeting_start_time: '16:00',
        meeting_end_time: '17:00',
      }),
    ).toBe('')
  })

  it('null / undefined slot → 空字串', () => {
    expect(formatWeekdaySchedule(null)).toBe('')
    expect(formatWeekdaySchedule(undefined)).toBe('')
  })
})

describe('hasWeekdaySchedule — 衝堂判定閘門語意不受退階影響', () => {
  it('只有星期沒時間 → 仍視為「無完整時段」（不可比衝堂）', () => {
    expect(
      hasWeekdaySchedule({ meeting_weekdays: [3], meeting_start_time: null, meeting_end_time: null }),
    ).toBe(false)
  })

  it('三欄齊備 → true', () => {
    expect(
      hasWeekdaySchedule({
        meeting_weekdays: [3],
        meeting_start_time: '16:00',
        meeting_end_time: '17:00',
      }),
    ).toBe(true)
  })

  it('缺時間的課程不參與衝堂判定（不誤報）', () => {
    const weekdaysOnly = { meeting_weekdays: [3], meeting_start_time: null, meeting_end_time: null }
    const full = { meeting_weekdays: [3], meeting_start_time: '16:00', meeting_end_time: '17:00' }
    expect(weekdaySchedulesOverlap(weekdaysOnly, full)).toBe(false)
  })
})

describe('isWeekdayScheduleIncomplete — 後台表單「勾了星期未填時間」提醒', () => {
  it('有星期但起訖時間缺任一 → true', () => {
    expect(
      isWeekdayScheduleIncomplete({ meeting_weekdays: [3], meeting_start_time: null, meeting_end_time: null }),
    ).toBe(true)
    expect(
      isWeekdayScheduleIncomplete({ meeting_weekdays: [3], meeting_start_time: '16:00', meeting_end_time: null }),
    ).toBe(true)
    expect(
      isWeekdayScheduleIncomplete({ meeting_weekdays: [3], meeting_start_time: '', meeting_end_time: '17:00' }),
    ).toBe(true)
  })

  it('三欄齊備或完全未設定 → false', () => {
    expect(
      isWeekdayScheduleIncomplete({
        meeting_weekdays: [3],
        meeting_start_time: '16:00',
        meeting_end_time: '17:00',
      }),
    ).toBe(false)
    expect(
      isWeekdayScheduleIncomplete({ meeting_weekdays: [], meeting_start_time: null, meeting_end_time: null }),
    ).toBe(false)
    expect(isWeekdayScheduleIncomplete(null)).toBe(false)
  })
})
