import { describe, expect, it } from 'vitest'
import { SALARY_SENSITIVE_FIELDS, SELF_EDITABLE_FIELDS } from '@/constants/employeeFields'

// 資安稽核 2026-10-28：後端 finance_guards.EMPLOYEE_SALARY_SENSITIVE_FIELDS 補了影響實領的欄位，
// 前端鎖頭清單須同步，否則本人編輯時欄位未上鎖、送出才 403。
describe('employeeFields 自我編輯清單', () => {
  it('包含 10-28 後端補列的薪資輸入欄位', () => {
    for (const f of [
      'health_exempt', 'no_employment_insurance', 'dependents', 'work_start_time',
      'work_end_time', 'birthday', 'bypass_standard_base', 'skip_payroll_bonuses',
    ]) {
      expect(SALARY_SENSITIVE_FIELDS).toContain(f)
    }
  })

  it('本人可編輯欄位與薪資敏感欄位不重疊', () => {
    expect(SELF_EDITABLE_FIELDS.filter((f) => SALARY_SENSITIVE_FIELDS.includes(f))).toEqual([])
  })
})
