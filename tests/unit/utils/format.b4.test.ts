import { describe, it, expect } from 'vitest'
import { formatTaipeiDateTimeMinute, todayTaipeiISO } from '@/utils/format'

// C4-Intl-formatters（batch4）：format.ts 的兩個 Intl.DateTimeFormat 提到 module 常數重用。
// options 皆靜態、時區固定 Asia/Taipei，輸出與改前逐次 new 實例完全一致（hardcode 鎖定）。
// 因指定 timeZone: 'Asia/Taipei'，結果與測試機所在時區無關，可安全 hardcode。

describe('formatTaipeiDateTimeMinute() — 重用 DateTimeFormat 單例', () => {
  it('固定 UTC 瞬時 → Taipei wall time（YYYY-MM-DD HH:MM）逐字一致', () => {
    expect(formatTaipeiDateTimeMinute(new Date('2026-07-17T03:05:00Z'))).toBe('2026-07-17 11:05')
    // 跨日邊界：UTC 16:00 → Taipei 次日 00:00
    expect(formatTaipeiDateTimeMinute(new Date('2025-12-31T16:00:00Z'))).toBe('2026-01-01 00:00')
    // h23 小時制：晚上 23:30
    expect(formatTaipeiDateTimeMinute(new Date('2026-03-07T15:30:00Z'))).toBe('2026-03-07 23:30')
  })

  it('可解析的 naive 字串（後端才藝 wall time）也走 Taipei', () => {
    // parseTaipeiDateTime 把無 zone 字串當 +08:00 → 原樣顯示
    expect(formatTaipeiDateTimeMinute('2026-07-17T09:00:00')).toBe('2026-07-17 09:00')
  })

  it('null / 空 / 不可解析 → —', () => {
    expect(formatTaipeiDateTimeMinute(null)).toBe('—')
    expect(formatTaipeiDateTimeMinute('')).toBe('—')
    expect(formatTaipeiDateTimeMinute('not-a-date')).toBe('—')
  })

  it('連續多次呼叫輸出穩定（單例重用無殘留狀態）', () => {
    const d = new Date('2026-06-01T00:00:00Z')
    const first = formatTaipeiDateTimeMinute(d)
    for (let i = 0; i < 5; i++) {
      expect(formatTaipeiDateTimeMinute(d)).toBe(first)
    }
    expect(first).toBe('2026-06-01 08:00')
  })
})

describe('todayTaipeiISO() — 重用 DateTimeFormat 單例', () => {
  it('固定 now → Taipei 當日 YYYY-MM-DD 逐字一致', () => {
    // UTC 20:00 → Taipei 次日 04:00
    expect(todayTaipeiISO(new Date('2026-07-17T20:00:00Z'))).toBe('2026-07-18')
    // UTC 18:00 於除夕 → Taipei 已跨到 2026-01-01 02:00
    expect(todayTaipeiISO(new Date('2025-12-31T18:00:00Z'))).toBe('2026-01-01')
    // 白天不跨日
    expect(todayTaipeiISO(new Date('2026-07-17T03:00:00Z'))).toBe('2026-07-17')
  })
})
