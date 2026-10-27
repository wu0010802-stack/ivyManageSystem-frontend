import { describe, it, expect } from 'vitest'
import {
  fmtPct,
  pad2,
  formatIsoMinute,
  formatIsoDate,
  formatLocalHourMinute,
} from '@/utils/format'

describe('fmtPct', () => {
  it('數值已是百分比 → 一位小數 + %', () => expect(fmtPct(83.62)).toBe('83.6%'))
  it('isRatio: 0–1 比值 ×100', () => expect(fmtPct(0.905, { isRatio: true })).toBe('90.5%'))
  it('digits 覆寫', () => expect(fmtPct(83.625, { digits: 2 })).toBe('83.63%'))
  it('null/undefined/NaN → em dash', () => {
    expect(fmtPct(null)).toBe('—'); expect(fmtPct(undefined)).toBe('—'); expect(fmtPct('abc')).toBe('—')
  })
})

describe('pad2', () => {
  it('個位數補零、兩位數原樣', () => {
    expect(pad2(0)).toBe('00')
    expect(pad2(7)).toBe('07')
    expect(pad2(12)).toBe('12')
  })
})

// 以下三支是「各元件本地副本收斂」的共用實作，輸出須與原本各處本地版逐字相同。
describe('formatIsoMinute（純字串切片，不經 Date）', () => {
  it('T 換空白並取前 16 字元', () => {
    expect(formatIsoMinute('2026-04-01T09:05:33')).toBe('2026-04-01 09:05')
    expect(formatIsoMinute('2026-04-01 09:05:33')).toBe('2026-04-01 09:05')
  })
  it('不做時區轉換（帶 Z 的字串照切）', () => {
    expect(formatIsoMinute('2026-04-01T23:59:59Z')).toBe('2026-04-01 23:59')
  })
  it('falsy 預設回空字串，可指定 fallback', () => {
    expect(formatIsoMinute(null)).toBe('')
    expect(formatIsoMinute(undefined)).toBe('')
    expect(formatIsoMinute('')).toBe('')
    expect(formatIsoMinute(null, '—')).toBe('—')
    expect(formatIsoMinute('', '尚未更新')).toBe('尚未更新')
  })
})

describe('formatIsoDate（純字串切片）', () => {
  it('砍掉 T 之後全部', () => {
    expect(formatIsoDate('2026-04-01T09:05:33')).toBe('2026-04-01')
    expect(formatIsoDate('2026-04-01')).toBe('2026-04-01')
  })
  it('falsy 預設回空字串，可指定 fallback', () => {
    expect(formatIsoDate(null)).toBe('')
    expect(formatIsoDate(undefined)).toBe('')
    expect(formatIsoDate('')).toBe('')
    expect(formatIsoDate(null, '—')).toBe('—')
  })
})

describe('formatLocalHourMinute（本地時區 HH:MM）', () => {
  it('Date 與 ISO 字串都轉成本地 HH:MM（補零）', () => {
    expect(formatLocalHourMinute(new Date(2026, 3, 1, 9, 5))).toBe('09:05')
    expect(formatLocalHourMinute(new Date(2026, 3, 1, 23, 59))).toBe('23:59')
    // 無時區字串依規格解讀為本地時間
    expect(formatLocalHourMinute('2026-04-01T07:08:09')).toBe('07:08')
  })
  it('falsy 或無法解析 → fallback（預設空字串）', () => {
    expect(formatLocalHourMinute(null)).toBe('')
    expect(formatLocalHourMinute(undefined)).toBe('')
    expect(formatLocalHourMinute('')).toBe('')
    expect(formatLocalHourMinute('not-a-date')).toBe('')
    expect(formatLocalHourMinute(new Date('invalid'))).toBe('')
    expect(formatLocalHourMinute(null, '—')).toBe('—')
    expect(formatLocalHourMinute('not-a-date', '—')).toBe('—')
  })
})
