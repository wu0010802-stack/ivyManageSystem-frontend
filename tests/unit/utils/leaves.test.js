import { describe, it, expect } from 'vitest'
import { LEAVE_TYPES, LEAVE_TYPE_MAP } from '@/utils/leaves'

describe('LEAVE_TYPES', () => {
  it('包含 14 種假別', () => {
    expect(LEAVE_TYPES).toHaveLength(14)
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
    const noDeductTypes = ['annual', 'maternity', 'paternity', 'official', 'marriage', 'bereavement']
    for (const value of noDeductTypes) {
      const t = LEAVE_TYPES.find(t => t.value === value)
      expect(t.deduction).toBe('不扣')
    }
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
