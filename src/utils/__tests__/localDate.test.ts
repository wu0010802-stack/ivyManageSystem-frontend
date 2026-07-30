import { describe, expect, it, vi } from 'vitest'
import {
  nowTaipeiNaiveISO,
  parseLocalISODate,
  parseTaipeiDateTime,
  todayTaipeiISO,
} from '@/utils/format'

describe('parseLocalISODate', () => {
  it('把 YYYY-MM-DD 解析為本地午夜，不套用 UTC 位移', () => {
    const date = parseLocalISODate('2026-07-13')

    expect(date).not.toBeNull()
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(6)
    expect(date?.getDate()).toBe(13)
    expect(date?.getHours()).toBe(0)
  })

  it('拒絕不存在的日期與帶時間的字串', () => {
    expect(parseLocalISODate('2026-02-30')).toBeNull()
    expect(parseLocalISODate('2026-07-13T00:00:00')).toBeNull()
  })

  it('不受瀏覽器時區影響，固定取得台北曆日', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T16:30:00Z'))
    try {
      expect(todayTaipeiISO()).toBe('2026-07-13')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('nowTaipeiNaiveISO', () => {
  it('產出後端 now_taipei_naive() 同格式字串（無 Z、無 offset）', () => {
    // UTC 11:05 → 台北 19:05
    const iso = nowTaipeiNaiveISO(new Date('2026-07-30T11:05:07Z'))

    expect(iso).toBe('2026-07-30T19:05:07')
    expect(iso).not.toContain('Z')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })

  it('跨日：UTC 16:30 已是台北隔日，午夜小時為 00 而非 24', () => {
    expect(nowTaipeiNaiveISO(new Date('2026-07-12T16:30:00Z'))).toBe('2026-07-13T00:30:00')
  })
})

describe('parseTaipeiDateTime', () => {
  it('將無時區 ISO 字串固定視為台北時間', () => {
    expect(parseTaipeiDateTime('2026-07-13T09:00:00')?.toISOString()).toBe(
      '2026-07-13T01:00:00.000Z',
    )
  })

  it('保留已明示的 UTC 或 offset，並拒絕無效值', () => {
    expect(parseTaipeiDateTime('2026-07-13T09:00:00Z')?.toISOString()).toBe(
      '2026-07-13T09:00:00.000Z',
    )
    expect(parseTaipeiDateTime('2026-07-13T09:00:00+08:00')?.toISOString()).toBe(
      '2026-07-13T01:00:00.000Z',
    )
    expect(parseTaipeiDateTime('not-a-date')).toBeNull()
  })
})
