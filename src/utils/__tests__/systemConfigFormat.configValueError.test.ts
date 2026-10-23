import { describe, it, expect } from 'vitest'
import { configValueError } from '../systemConfigFormat'

describe('configValueError（與後端 require_valid_config_value 對齊）', () => {
  it('month：只接受 20YY-MM', () => {
    expect(configValueError('month', '2026-02')).toBeNull()
    expect(configValueError('month', '2026-13')).toBe('須為 YYYY-MM 格式')
    expect(configValueError('month', '2026-2')).toBe('須為 YYYY-MM 格式')
    expect(configValueError('month', '115-02')).toBe('須為 YYYY-MM 格式')
  })

  it('date：只接受 20YY-MM-DD 且須為實際存在的日期', () => {
    expect(configValueError('date', '2026-09-01')).toBeNull()
    expect(configValueError('date', '2028-02-29')).toBeNull() // 閏年
    expect(configValueError('date', ' 2026-12-31 ')).toBeNull()
    const msg = '須為 YYYY-MM-DD 格式的有效日期'
    expect(configValueError('date', '2026-02-30')).toBe(msg)
    expect(configValueError('date', '2027-02-29')).toBe(msg) // 非閏年
    expect(configValueError('date', '2026-04-31')).toBe(msg)
    expect(configValueError('date', '2026-13-01')).toBe(msg)
    expect(configValueError('date', '2026-00-10')).toBe(msg)
    expect(configValueError('date', '2026-09-00')).toBe(msg)
    expect(configValueError('date', '2026-9-1')).toBe(msg)
    expect(configValueError('date', '2026/09/01')).toBe(msg)
    expect(configValueError('date', '115-09-01')).toBe(msg)
    expect(configValueError('date', '2026-09')).toBe(msg)
    expect(configValueError('date', '2026-09-01T00:00')).toBe(msg)
  })

  it('date：空值擋下', () => {
    expect(configValueError('date', '')).toBe('尚未選擇')
    expect(configValueError('date', null)).toBe('尚未選擇')
  })

  it('select：只接受選項內的值', () => {
    const allowed = ['calendar', 'academic', 'anniversary']
    expect(configValueError('select', 'anniversary', allowed)).toBeNull()
    expect(configValueError('select', 'fiscal', allowed)).toBe('只接受：calendar、academic、anniversary')
  })

  it('空值一律擋下（後端 PUT 要求至少 1 字）', () => {
    expect(configValueError('month', '')).toBe('尚未選擇')
    expect(configValueError('select', '  ', ['a'])).toBe('尚未選擇')
    expect(configValueError('month', null)).toBe('尚未選擇')
  })

  it('text 不檢核', () => {
    expect(configValueError('text', '')).toBeNull()
  })
})
