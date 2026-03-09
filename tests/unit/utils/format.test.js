import { describe, it, expect } from 'vitest'
import { money, formatTime, formatDate } from '@/utils/format'

describe('money()', () => {
  it('null 回傳 "-"', () => {
    expect(money(null)).toBe('-')
  })

  it('undefined 回傳 "-"', () => {
    expect(money(undefined)).toBe('-')
  })

  it('空字串回傳 "-"', () => {
    expect(money('')).toBe('-')
  })

  it('0 回傳 "$0"（不誤判為 falsy）', () => {
    expect(money(0)).toBe('$0')
  })

  it('正整數加 $ 前綴', () => {
    const result = money(1234)
    expect(result).toMatch(/^\$/)
    expect(result).toContain('1')
    expect(result).toContain('234')
  })

  it('字串數字也能格式化', () => {
    const result = money('5000')
    expect(result).toMatch(/^\$/)
  })

  it('輸出值等於 "$" + toLocaleString（行為一致性）', () => {
    expect(money(50000)).toBe('$' + Number(50000).toLocaleString())
  })
})

describe('formatTime()', () => {
  it('null 回傳 "-"', () => {
    expect(formatTime(null)).toBe('-')
  })

  it('空字串回傳 "-"', () => {
    expect(formatTime('')).toBe('-')
  })

  it('ISO 字串取 HH:MM（index 11-16）', () => {
    expect(formatTime('2026-03-07T09:30:00')).toBe('09:30')
  })

  it('只有日期沒有時間部分，回傳空字串（無法取到 HH:MM）', () => {
    // '2026-03-07' slice(11,16) → ''，實作行為如此
    expect(formatTime('2026-03-07')).toBe('')
  })
})

describe('formatDate()', () => {
  it('null 回傳空字串', () => {
    expect(formatDate(null)).toBe('')
  })

  it('空字串回傳空字串', () => {
    expect(formatDate('')).toBe('')
  })

  it('格式化後符合 YYYY-MM-DD HH:MM 格式', () => {
    // 不含時區後綴，直接以本地時間解析，避免時區差異
    const result = formatDate('2026-03-07T09:05:00')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('日期部分正確', () => {
    const result = formatDate('2026-03-07T09:05:00')
    expect(result.startsWith('2026-03-07')).toBe(true)
  })

  it('時間部分個位數補零', () => {
    const result = formatDate('2026-03-07T09:05:00')
    expect(result).toBe('2026-03-07 09:05')
  })
})
