import { describe, it, expect } from 'vitest'
import { EDITABLE_SALARY_FIELDS } from '@/constants/salaryFields'

describe('EDITABLE_SALARY_FIELDS', () => {
  it('含 12 個可調欄位且為 frozen', () => {
    expect(EDITABLE_SALARY_FIELDS).toHaveLength(12)
    expect(Object.isFrozen(EDITABLE_SALARY_FIELDS)).toBe(true)
    expect(EDITABLE_SALARY_FIELDS.map((f) => f.key)).toContain('festival_bonus')
    expect(EDITABLE_SALARY_FIELDS.every((f) => typeof f.key === 'string' && typeof f.label === 'string')).toBe(true)
  })
})
