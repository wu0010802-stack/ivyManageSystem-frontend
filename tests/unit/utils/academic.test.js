import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCurrentAcademicTerm, normalizeSchoolYear, buildSchoolYearOptions } from '@/utils/academic'

// 民國年換算：西元年 - 1911
// 2025 → 114，2024 → 113

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
