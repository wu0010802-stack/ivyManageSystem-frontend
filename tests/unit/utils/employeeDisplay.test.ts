import { describe, it, expect } from 'vitest'
import {
  statusKeyOf, getEmployeeStatus, maskedMoney, insuranceLevelDisplay,
  pensionSelfRatePct, bankInfoDisplay, detectRole, standardSalaryFor,
  isMissingSalary, tenureLabel,
} from '@/utils/employeeDisplay'

describe('statusKeyOf / getEmployeeStatus', () => {
  it('is_active=false → resigned', () => {
    expect(statusKeyOf({ is_active: false })).toBe('resigned')
    expect(getEmployeeStatus({ is_active: false })).toEqual({ label: '已離職', type: 'info' })
  })
  it('resign_date 在未來 → pending（標籤帶日期）', () => {
    expect(statusKeyOf({ is_active: true, resign_date: '2999-12-31' })).toBe('pending')
    expect(getEmployeeStatus({ is_active: true, resign_date: '2999-12-31' }).label).toBe('待離職・2999-12-31')
  })
  it('在職', () => {
    expect(statusKeyOf({ is_active: true })).toBe('active')
  })
})

describe('薪資遮罩顯示（後端 role/self 遮罩回 null，嚴禁顯示成 0）', () => {
  it('null/undefined → 無檢視權限', () => {
    expect(maskedMoney(null)).toBe('無檢視權限')
    expect(maskedMoney(undefined)).toBe('無檢視權限')
    expect(insuranceLevelDisplay(null)).toBe('無檢視權限')
  })
  it('數字格式化', () => {
    expect(maskedMoney(45300)).toBe('45,300')
    expect(maskedMoney(0)).toBe('0')
  })
  it('投保級距 0 → 未設定', () => {
    expect(insuranceLevelDisplay(0)).toBe('未設定')
    expect(insuranceLevelDisplay(45300)).toBe('45,300')
  })
  it('非數字 → —', () => {
    expect(maskedMoney('abc')).toBe('—')
  })
  it('勞退自提百分比', () => {
    expect(pensionSelfRatePct(0.06)).toBe('6.0%')
    expect(pensionSelfRatePct(null)).toBe('無檢視權限')
    expect(pensionSelfRatePct(0)).toBe('0.0%')
  })
  it('銀行資訊：全空 → —；有值組合顯示', () => {
    expect(bankInfoDisplay({})).toBe('—')
    expect(bankInfoDisplay({ bank_code: '822', bank_account: '123', bank_account_name: '王' }))
      .toBe('822 - 123（王）')
    expect(bankInfoDisplay({ bank_code: '822', bank_account: '123' })).toBe('822 - 123')
  })
})

describe('isMissingSalary（待補薪資單一來源：在職 + 正職 + 底薪嚴格 === 0）', () => {
  it('正職 + 在職 + base_salary=0 → true', () => {
    expect(isMissingSalary({ is_active: true, employee_type: 'regular', base_salary: 0 })).toBe(true)
  })
  it('base_salary 為 null/undefined（遮罩）→ false', () => {
    expect(isMissingSalary({ is_active: true, employee_type: 'regular', base_salary: null })).toBe(false)
    expect(isMissingSalary({ is_active: true, employee_type: 'regular', base_salary: undefined })).toBe(false)
  })
  it('非 regular（時薪制）→ false', () => {
    expect(isMissingSalary({ is_active: true, employee_type: 'hourly', base_salary: 0 })).toBe(false)
  })
  it('非在職（已離職）→ false', () => {
    expect(isMissingSalary({ is_active: false, employee_type: 'regular', base_salary: 0 })).toBe(false)
  })
  it('base_salary > 0 → false', () => {
    expect(isMissingSalary({ is_active: true, employee_type: 'regular', base_salary: 30000 })).toBe(false)
  })
})

describe('detectRole / standardSalaryFor（自舊員工頁搬出，行為不變）', () => {
  it('班導/副班導判定', () => {
    expect(detectRole('班導')).toBe('head')
    expect(detectRole('副班導')).toBe('assistant')
    expect(detectRole('廚工')).toBeNull()
    expect(detectRole(null)).toBeNull()
  })
  it('依 role+grade 查 head_teacher_a', () => {
    const cfg = { head_teacher_a: 40000 }
    expect(standardSalaryFor({ position: '班導', bonus_grade: 'A' }, cfg)).toBe(40000)
  })
  it('cfg 為 null → null', () => {
    expect(standardSalaryFor({ position: '班導', bonus_grade: 'A' }, null)).toBeNull()
  })
})

describe('tenureLabel', () => {
  it('在職員工由到職日計算年資（X.Y 年）', () => {
    expect(tenureLabel({ is_active: true, hire_date: '2019-08-01' }, '2026-07-13')).toBe('6.9 年')
  })
  it('當月到職 → 0.0 年', () => {
    expect(tenureLabel({ is_active: true, hire_date: '2026-07-01' }, '2026-07-13')).toBe('0.0 年')
  })
  it('已離職 → —', () => {
    expect(tenureLabel({ is_active: false, hire_date: '2019-08-01' }, '2026-07-13')).toBe('—')
  })
  it('缺 hire_date 或非法格式 → —', () => {
    expect(tenureLabel({ is_active: true }, '2026-07-13')).toBe('—')
    expect(tenureLabel({ is_active: true, hire_date: 'not-a-date' }, '2026-07-13')).toBe('—')
  })
  it('曆法非法日期（月/日溢位）→ —', () => {
    expect(tenureLabel({ is_active: true, hire_date: '2026-13-45' }, '2026-07-13')).toBe('—')
    expect(tenureLabel({ is_active: true, hire_date: '2026-02-30' }, '2026-07-13')).toBe('—')
  })
  it('未來到職日 → —', () => {
    expect(tenureLabel({ is_active: true, hire_date: '2026-08-01' }, '2026-07-13')).toBe('—')
  })
})
