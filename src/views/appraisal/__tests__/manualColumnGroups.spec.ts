import { describe, it, expect } from 'vitest'
import { MANUAL_COLUMN_GROUPS, assertGroupsCoverAllCodes } from '../manualColumnGroups'
import { MANUAL_ITEM_CODES } from '../composables/useManualEventEntry'

describe('MANUAL_COLUMN_GROUPS', () => {
  it('分組涵蓋全部 11 碼且無重複', () => {
    const grouped = MANUAL_COLUMN_GROUPS.flatMap((g) => g.codes)
    expect(new Set(grouped).size).toBe(grouped.length) // 無重複
    expect([...grouped].sort()).toEqual([...MANUAL_ITEM_CODES].sort()) // 完整涵蓋
  })

  it('恰為 11 碼', () => {
    const grouped = MANUAL_COLUMN_GROUPS.flatMap((g) => g.codes)
    expect(grouped.length).toBe(11)
  })

  it('每組都有 label 與非空 codes', () => {
    for (const g of MANUAL_COLUMN_GROUPS) {
      expect(g.label.length).toBeGreaterThan(0)
      expect(g.codes.length).toBeGreaterThan(0)
    }
  })

  it('assertGroupsCoverAllCodes 對真實 MANUAL_ITEM_CODES 不丟例外', () => {
    expect(() => assertGroupsCoverAllCodes(MANUAL_ITEM_CODES)).not.toThrow()
  })

  it('assertGroupsCoverAllCodes 對缺漏 code 丟例外', () => {
    expect(() => assertGroupsCoverAllCodes(['SCHOOL_MEETING_ABSENCE'])).toThrow()
  })

  it('assertGroupsCoverAllCodes 對多餘（未知）code 丟例外', () => {
    expect(() => assertGroupsCoverAllCodes([...MANUAL_ITEM_CODES, 'UNKNOWN_CODE'])).toThrow()
  })
})
