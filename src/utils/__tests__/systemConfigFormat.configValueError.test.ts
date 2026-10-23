import { describe, it, expect } from 'vitest'
import { configValueError } from '../systemConfigFormat'

describe('configValueError（與後端 require_valid_config_value 對齊）', () => {
  it('month：只接受 20YY-MM', () => {
    expect(configValueError('month', '2026-02')).toBeNull()
    expect(configValueError('month', '2026-13')).toBe('須為 YYYY-MM 格式')
    expect(configValueError('month', '2026-2')).toBe('須為 YYYY-MM 格式')
    expect(configValueError('month', '115-02')).toBe('須為 YYYY-MM 格式')
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
