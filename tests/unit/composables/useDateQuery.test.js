import { describe, it, expect } from 'vitest'
import { useDateQuery } from '@/composables/useDateQuery'

describe('useDateQuery', () => {
  it('currentYear 對應今年', () => {
    const { currentYear } = useDateQuery()
    expect(currentYear).toBe(new Date().getFullYear())
  })

  it('currentMonth 對應今月（1-based）', () => {
    const { currentMonth } = useDateQuery()
    expect(currentMonth).toBe(new Date().getMonth() + 1)
  })

  it('query.year 預設為今年', () => {
    const { query } = useDateQuery()
    expect(query.year).toBe(new Date().getFullYear())
  })

  it('query.month 預設為今月', () => {
    const { query } = useDateQuery()
    expect(query.month).toBe(new Date().getMonth() + 1)
  })

  it('query.employee_id 預設為 null', () => {
    const { query } = useDateQuery()
    expect(query.employee_id).toBeNull()
  })

  it('query 為 reactive 物件（可直接修改）', () => {
    const { query } = useDateQuery()
    query.employee_id = 'E001'
    expect(query.employee_id).toBe('E001')
  })

  it('每次呼叫回傳獨立的 query 實例', () => {
    const a = useDateQuery()
    const b = useDateQuery()
    a.query.employee_id = 'E001'
    expect(b.query.employee_id).toBeNull()
  })
})
