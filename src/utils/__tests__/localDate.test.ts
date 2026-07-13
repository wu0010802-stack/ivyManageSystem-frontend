import { describe, expect, it } from 'vitest'
import { parseLocalISODate } from '@/utils/format'

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
})
