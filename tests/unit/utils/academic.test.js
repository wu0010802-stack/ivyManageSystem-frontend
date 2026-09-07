import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCurrentAcademicTerm,
  normalizeSchoolYear,
  buildSchoolYearOptions,
  toRocYear,
  toAdYear,
  currentRocYear,
  coerceRocYear,
  getTermDateRange,
} from '@/utils/academic'

// 民國年換算：西元年 - 1911
// 2025 → 114，2024 → 113

describe('民國年 ↔ 西元年原語', () => {
  it('toRocYear：西元 → 民國（- 1911）', () => {
    expect(toRocYear(2025)).toBe(114)
    expect(toRocYear(2024)).toBe(113)
  })

  it('toAdYear：民國 → 西元（+ 1911）', () => {
    expect(toAdYear(114)).toBe(2025)
    expect(toAdYear(113)).toBe(2024)
  })

  it('toRocYear / toAdYear 互逆', () => {
    expect(toAdYear(toRocYear(2025))).toBe(2025)
  })

  it('currentRocYear：當前西元年對應民國學年度', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15))
    expect(currentRocYear()).toBe(114)
    vi.useRealTimers()
  })

  it('coerceRocYear：> 1911 視為西元年轉民國', () => {
    expect(coerceRocYear(2025)).toBe(114)
  })

  it('coerceRocYear：≤ 1911 視為已是民國年，原樣回傳', () => {
    expect(coerceRocYear(114)).toBe(114)
  })
})

describe('getCurrentAcademicTerm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mockDate = (month, year = 2025) => {
    // month 為 1-based，setSystemTime 需要 0-based month
    vi.setSystemTime(new Date(year, month - 1, 15))
  }

  it('8月 → 上學期（semester=1，當年）', () => {
    mockDate(8, 2025)
    expect(getCurrentAcademicTerm()).toEqual({ school_year: 114, semester: 1 })
  })

  it('7月 → 下學期（semester=2，前一學年）', () => {
    mockDate(7, 2025)
    expect(getCurrentAcademicTerm()).toEqual({ school_year: 113, semester: 2 })
  })

  it('2月 → 下學期（semester=2）', () => {
    mockDate(2, 2025)
    expect(getCurrentAcademicTerm()).toEqual({ school_year: 113, semester: 2 })
  })

  it('1月 → 上學期（semester=1，前一學年）', () => {
    mockDate(1, 2025)
    expect(getCurrentAcademicTerm()).toEqual({ school_year: 113, semester: 1 })
  })

  it('12月 → 上學期', () => {
    mockDate(12, 2025)
    expect(getCurrentAcademicTerm()).toEqual({ school_year: 114, semester: 1 })
  })

  it('9月 → 上學期', () => {
    mockDate(9, 2025)
    expect(getCurrentAcademicTerm()).toEqual({ school_year: 114, semester: 1 })
  })
})

describe('normalizeSchoolYear', () => {
  it('傳入有效數字，直接回傳', () => {
    expect(normalizeSchoolYear(114)).toBe(114)
  })

  it('傳入數字字串，轉為數字', () => {
    expect(normalizeSchoolYear('114')).toBe(114)
  })

  it('傳入 undefined，回傳當前學年（民國年）', () => {
    const result = normalizeSchoolYear(undefined)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(100)
    expect(result).toBeLessThan(200)
  })

  it('傳入 NaN，回傳當前學年（民國年）', () => {
    const result = normalizeSchoolYear(NaN)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(100)
    expect(result).toBeLessThan(200)
  })

  it('傳入 null，回傳當前學年', () => {
    const result = normalizeSchoolYear(null)
    expect(typeof result).toBe('number')
  })
})

describe('buildSchoolYearOptions', () => {
  it('預設 range=5，回傳 11 個年份', () => {
    const result = buildSchoolYearOptions(114)
    expect(result).toHaveLength(11)
  })

  it('包含當前年份', () => {
    const result = buildSchoolYearOptions(114)
    expect(result).toContain(114)
  })

  it('由大到小排列', () => {
    const result = buildSchoolYearOptions(114)
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]).toBeGreaterThan(result[i + 1])
    }
  })

  it('自訂 range=2，回傳 5 個年份', () => {
    const result = buildSchoolYearOptions(114, 2)
    expect(result).toHaveLength(5)
    expect(result).toContain(112)
    expect(result).toContain(113)
    expect(result).toContain(114)
    expect(result).toContain(115)
    expect(result).toContain(116)
  })
})

describe('getTermDateRange', () => {
  it('上學期＝該學年 8/1 至隔年 1/31', () => {
    // 115 學年 = 西元 2026 起
    expect(getTermDateRange(115, 1, new Date(2027, 5, 15))).toEqual([
      '2026-08-01',
      '2027-01-31',
    ])
  })

  it('下學期＝隔年 2/1 至 7/31', () => {
    expect(getTermDateRange(115, 2, new Date(2028, 0, 10))).toEqual([
      '2027-02-01',
      '2027-07-31',
    ])
  })

  it('今天落在學期之中時，結束日截到今天（帳本沒有未來的異動）', () => {
    expect(getTermDateRange(115, 1, new Date(2026, 8, 7))).toEqual([
      '2026-08-01',
      '2026-09-07',
    ])
  })

  it('學期尚未開始時不截斷，回傳完整區間（避免起訖顛倒）', () => {
    expect(getTermDateRange(116, 1, new Date(2026, 8, 7))).toEqual([
      '2027-08-01',
      '2028-01-31',
    ])
  })

  it('起訖一律早於或等於結束，不會顛倒', () => {
    for (const [sy, sem] of [[114, 1], [114, 2], [115, 1], [115, 2], [116, 1]]) {
      const [from, to] = getTermDateRange(sy, sem, new Date(2026, 8, 7))
      expect(from <= to).toBe(true)
    }
  })

  it('日期以本地時區計算，不受 UTC 位移影響（台北清晨也拿到當天）', () => {
    // 台北 2026-09-07 07:00 → UTC 仍是 09-06；toISOString() 會少一天
    const taipeiEarlyMorning = new Date(2026, 8, 7, 7, 0, 0)
    expect(getTermDateRange(115, 1, taipeiEarlyMorning)[1]).toBe('2026-09-07')
  })
})
