// QA F1（2026-11-05）：薪資輸入歷史欄清單與後端同源的鎖定測試。
// 後端 source of truth：ivy-backend services/salary/input_history.py::SALARY_INPUT_HISTORY_FIELDS
// （後端以 tests/test_salary_input_history.py::TestFieldSetLocked 鎖死）。
// 本檔刻意不 import 後端，以下方寫死的快照比對；後端增減欄位時，須同步修改
// src/constants/salaryInputHistory.ts 與本檔快照（兩處一起改，測試才會綠）。
import { describe, it, expect } from 'vitest'
import {
  SALARY_INPUT_HISTORY_FIELDS,
  touchesSalaryInputHistory,
} from '@/constants/salaryInputHistory'
import { BASIC_TAB_FIELDS, SALARY_TAB_FIELDS } from '@/constants/employeeFields'

// 與後端 SALARY_INPUT_HISTORY_FIELDS 逐字一致（18 欄，排序後比對）
const BACKEND_SNAPSHOT_2026_11_05 = [
  'base_salary',
  'bonus_grade',
  'bypass_standard_base',
  'dependents',
  'health_exempt',
  'health_insured_salary',
  'health_self_pay_ratio',
  'hourly_rate',
  'insurance_salary_level',
  'job_title_id',
  'labor_insured_salary',
  'no_employment_insurance',
  'not_insured',
  'pension_insured_salary',
  'pension_self_rate',
  'position',
  'supervisor_role',
  'title',
]

describe('SALARY_INPUT_HISTORY_FIELDS 與後端同源', () => {
  it('內容鎖定為後端 18 欄快照（後端增減欄位須同步改這裡與常數檔）', () => {
    expect([...SALARY_INPUT_HISTORY_FIELDS].sort()).toEqual(BACKEND_SNAPSHOT_2026_11_05)
    expect(new Set(SALARY_INPUT_HISTORY_FIELDS).size).toBe(SALARY_INPUT_HISTORY_FIELDS.length)
  })

  it('基本資料 tab 的歷史欄 = dependents／job_title_id／position／supervisor_role／bonus_grade', () => {
    const inBasic = SALARY_INPUT_HISTORY_FIELDS.filter((f) => (BASIC_TAB_FIELDS as readonly string[]).includes(f))
    expect(inBasic.sort()).toEqual(['bonus_grade', 'dependents', 'job_title_id', 'position', 'supervisor_role'])
  })

  it('每個歷史欄都落在兩個 tab 之一（title 例外：隨 job_title_id 由後端同步，不是表單欄位）', () => {
    const covered = new Set<string>([...BASIC_TAB_FIELDS, ...SALARY_TAB_FIELDS])
    const orphan = SALARY_INPUT_HISTORY_FIELDS.filter((f) => !covered.has(f))
    expect(orphan).toEqual(['title'])
  })

  it('清單被凍結，執行期不可被改動', () => {
    expect(Object.isFrozen(SALARY_INPUT_HISTORY_FIELDS)).toBe(true)
  })
})

describe('touchesSalaryInputHistory', () => {
  it('含任一歷史欄 → true', () => {
    expect(touchesSalaryInputHistory(['name', 'bonus_grade'])).toBe(true)
    expect(touchesSalaryInputHistory(['health_self_pay_ratio'])).toBe(true)
  })

  it('只有非歷史欄或空集合 → false', () => {
    expect(touchesSalaryInputHistory(['name', 'phone', 'bank_account'])).toBe(false)
    expect(touchesSalaryInputHistory([])).toBe(false)
  })
})
