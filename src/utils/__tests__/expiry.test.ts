import { describe, it, expect } from 'vitest'
import { expiryStatus } from '@/utils/expiry'

// 固定基準日（本地時間 15:00），並用「本地日期」手動組字串當測資，
// 避免用 `new Date('YYYY-MM-DD')`（會被當 UTC 午夜解析）造成台北 UTC+8 偏移假綠。
// 手法沿用 dateRange.test.ts 的既有教訓。
const TODAY = new Date(2026, 6, 10, 15, 0) // 2026-07-10 15:00 本地時間

function isoOffset(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('expiryStatus', () => {
  it('昨天 → expired', () => {
    const result = expiryStatus(isoOffset(TODAY, -1), TODAY)
    expect(result.kind).toBe('expired')
  })

  it('今天 → expiring，剩餘天數 0', () => {
    const result = expiryStatus(isoOffset(TODAY, 0), TODAY)
    expect(result.kind).toBe('expiring')
    expect(result.days).toBe(0)
  })

  it('今天+30 天（邊界含）→ expiring，剩餘天數 30', () => {
    const result = expiryStatus(isoOffset(TODAY, 30), TODAY)
    expect(result.kind).toBe('expiring')
    expect(result.days).toBe(30)
  })

  it('今天+31 天（邊界外）→ ok', () => {
    const result = expiryStatus(isoOffset(TODAY, 31), TODAY)
    expect(result.kind).toBe('ok')
  })

  it('null → none，days 為 null', () => {
    expect(expiryStatus(null, TODAY)).toEqual({ kind: 'none', days: null })
  })

  it('undefined → none，days 為 null', () => {
    expect(expiryStatus(undefined, TODAY)).toEqual({ kind: 'none', days: null })
  })

  it('空字串 → none，days 為 null', () => {
    expect(expiryStatus('', TODAY)).toEqual({ kind: 'none', days: null })
  })

  it('today 傳入凌晨時刻仍以本地日期比較（不受時分秒與 UTC 偏移影響）', () => {
    const earlyMorning = new Date(2026, 6, 10, 0, 30) // 07-10 00:30 本地
    const result = expiryStatus('2026-07-10', earlyMorning)
    expect(result.kind).toBe('expiring')
    expect(result.days).toBe(0)
  })

  it('過期天數（days）為負值，供未來顯示「已逾期 N 天」使用', () => {
    const result = expiryStatus(isoOffset(TODAY, -5), TODAY)
    expect(result.kind).toBe('expired')
    expect(result.days).toBe(-5)
  })
})
