import { describe, it, expect } from 'vitest'
import { LEAVE_TYPES, LEAVE_TYPE_MAP, LEAVE_CATEGORY_MAP, LEAVE_CATEGORY_LABELS, getLeaveCategory } from '@/utils/leaves'

describe('LEAVE_TYPES', () => {
  it('至少包含 18 種假別（容許未來新增不打破測試）', () => {
    expect(LEAVE_TYPES.length).toBeGreaterThanOrEqual(18)
  })

  it('包含主要與擴充假別', () => {
    const values = LEAVE_TYPES.map(t => t.value)
    for (const value of ['personal', 'sick', 'annual', 'family_care', 'compensatory', 'occupational_injury', 'typhoon']) {
      expect(values).toContain(value)
    }
  })

  it('每筆資料皆有必要欄位', () => {
    for (const t of LEAVE_TYPES) {
      expect(t).toHaveProperty('value')
      expect(t).toHaveProperty('label')
      expect(t).toHaveProperty('color')
      expect(t).toHaveProperty('deduction')
      expect(typeof t.value).toBe('string')
      expect(typeof t.label).toBe('string')
    }
  })

  it('value 無重複', () => {
    const values = LEAVE_TYPES.map(t => t.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('color 只使用合法的 Element Plus tag type', () => {
    const validColors = ['success', 'info', 'warning', 'danger', '']
    for (const t of LEAVE_TYPES) {
      expect(validColors).toContain(t.color)
    }
  })

  it('扣薪假別正確標示（事假全扣、病假扣半薪）', () => {
    const personal = LEAVE_TYPES.find(t => t.value === 'personal')
    const sick = LEAVE_TYPES.find(t => t.value === 'sick')
    expect(personal.deduction).toBe('全扣')
    expect(sick.deduction).toBe('扣半薪')
  })

  it('不扣薪假別正確標示（特休、產假、公假等）', () => {
    const noDeductTypes = ['annual', 'maternity', 'paternity', 'official', 'marriage', 'bereavement', 'prenatal', 'compensatory', 'occupational_injury']
    for (const value of noDeductTypes) {
      const t = LEAVE_TYPES.find(t => t.value === value)
      expect(t.deduction).toBe('不扣')
    }
  })

  it('特殊假別維持目前扣薪文案', () => {
    expect(LEAVE_TYPES.find(t => t.value === 'family_care')?.deduction).toBe('全扣（併入事假）')
    expect(LEAVE_TYPES.find(t => t.value === 'parental_unpaid')?.deduction).toBe('留停無薪')
    expect(LEAVE_TYPES.find(t => t.value === 'pregnancy_rest')?.deduction).toBe('扣半薪（依病假）')
    expect(LEAVE_TYPES.find(t => t.value === 'typhoon')?.deduction).toBe('得不給薪')
  })
})

describe('LEAVE_TYPE_MAP', () => {
  it('keys 與 LEAVE_TYPES value 一一對應', () => {
    const expectedKeys = LEAVE_TYPES.map(t => t.value).sort()
    const actualKeys = Object.keys(LEAVE_TYPE_MAP).sort()
    expect(actualKeys).toEqual(expectedKeys)
  })

  it('每個 map 值有 label 和 type 欄位', () => {
    for (const [, v] of Object.entries(LEAVE_TYPE_MAP)) {
      expect(v).toHaveProperty('label')
      expect(v).toHaveProperty('type')
      expect(typeof v.label).toBe('string')
    }
  })

  it('type 欄位對應原始 color 欄位（供 Element Plus tag 使用）', () => {
    for (const t of LEAVE_TYPES) {
      expect(LEAVE_TYPE_MAP[t.value].type).toBe(t.color)
    }
  })

  it('label 欄位對應原始 label 欄位', () => {
    for (const t of LEAVE_TYPES) {
      expect(LEAVE_TYPE_MAP[t.value].label).toBe(t.label)
    }
  })

  it('O(1) 查詢：personal → 事假', () => {
    expect(LEAVE_TYPE_MAP['personal'].label).toBe('事假')
  })

  it('O(1) 查詢：annual → 特休', () => {
    expect(LEAVE_TYPE_MAP['annual'].label).toBe('特休')
  })
})

// 2026-09-15：行事曆事件底色改用六大類（取代側邊色條），每個假別必須有明確歸類，
// 落到 fallback「其他」視為漏登記，故用 LEAVE_TYPES 逐一驗證而非只驗證 map 本身。
describe('LEAVE_CATEGORY_MAP / getLeaveCategory', () => {
  const KNOWN_CATEGORIES = new Set(['per', 'sick', 'ann', 'off', 'mat', 'oth'])

  it('每個假別皆有明確歸類（不落到未登記的 fallback）', () => {
    for (const t of LEAVE_TYPES) {
      expect(LEAVE_CATEGORY_MAP).toHaveProperty(t.value)
    }
  })

  it('歸類值皆屬六大已知類別', () => {
    for (const category of Object.values(LEAVE_CATEGORY_MAP)) {
      expect(KNOWN_CATEGORIES.has(category)).toBe(true)
    }
  })

  it('LEAVE_CATEGORY_LABELS 涵蓋六大類且皆有中文標籤', () => {
    expect(new Set(Object.keys(LEAVE_CATEGORY_LABELS))).toEqual(KNOWN_CATEGORIES)
    for (const label of Object.values(LEAVE_CATEGORY_LABELS)) {
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('getLeaveCategory 對已知假別回傳對應類別', () => {
    expect(getLeaveCategory('sick')).toBe('sick')
    expect(getLeaveCategory('annual')).toBe('ann')
    expect(getLeaveCategory('compensatory')).toBe('ann')
    expect(getLeaveCategory('maternity')).toBe('mat')
  })

  it('getLeaveCategory 對未知假別 fallback 到「其他」，不拋錯', () => {
    expect(getLeaveCategory('not_a_real_type')).toBe('oth')
  })
})
