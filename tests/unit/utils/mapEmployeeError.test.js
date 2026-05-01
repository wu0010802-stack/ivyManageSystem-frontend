import { describe, it, expect } from 'vitest'
import { mapEmployeeError } from '@/utils/error'

const makeErr = (detail) => ({
  response: { data: { detail } },
  errorDetail: typeof detail === 'object' ? detail : null,
  displayMessage: typeof detail === 'object' ? detail.message : detail,
  message: 'fallback',
})

describe('mapEmployeeError', () => {
  it('SELF_FINANCE_EDIT_FORBIDDEN 帶出 fields', () => {
    const err = makeErr({
      code: 'SELF_FINANCE_EDIT_FORBIDDEN',
      message: '不得修改自己的金流敏感欄位（base_salary）',
      context: { fields: ['base_salary'] },
    })
    const r = mapEmployeeError(err)
    expect(r.type).toBe('warning')
    expect(r.message).toContain('不得修改自己')
    expect(r.fields).toEqual(['base_salary'])
    expect(r.action).toBeNull()
  })

  it('INSURANCE_BELOW_BASE 含同步按鈕 action', () => {
    const err = makeErr({
      code: 'INSURANCE_BELOW_BASE',
      message: '投保薪資 NT$28000 低於月薪 NT$30000',
      context: { kind: 'below_monthly_wage', base: 30000, current: 28000, suggested: 30000 },
    })
    const r = mapEmployeeError(err)
    expect(r.type).toBe('error')
    expect(r.action).toMatchObject({ label: '同步為基本薪資', value: 30000 })
  })

  it('BELOW_MINIMUM_WAGE 純文字', () => {
    const err = makeErr({
      code: 'BELOW_MINIMUM_WAGE',
      message: '月薪 NT$25000 低於法定基本工資',
      context: { employee_type: 'regular', minimum: 29500, current: 25000 },
    })
    const r = mapEmployeeError(err)
    expect(r.type).toBe('error')
    expect(r.action).toBeUndefined()
  })

  it('EMPLOYEE_ID_DUPLICATE 純文字', () => {
    const err = makeErr({
      code: 'EMPLOYEE_ID_DUPLICATE',
      message: '員工編號 EMP001 已存在',
      context: { employee_id: 'EMP001' },
    })
    const r = mapEmployeeError(err)
    expect(r.message).toContain('已存在')
  })

  it('未結構化的舊 detail fallback 為一般訊息', () => {
    const err = makeErr('某個舊版字串錯誤')
    const r = mapEmployeeError(err)
    expect(r.message).toBe('某個舊版字串錯誤')
  })

  it('完全沒有 detail 用 message 兜底', () => {
    const r = mapEmployeeError({ message: 'network', response: undefined })
    expect(r.message).toBe('network')
  })
})
