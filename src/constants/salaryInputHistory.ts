/**
 * 薪資輸入 effective-dated 歷史欄（員工主檔「異動生效日」會用到的欄位集合）
 *
 * 後端 source of truth：ivy-backend `services/salary/input_history.py::SALARY_INPUT_HISTORY_FIELDS`
 * （後端以 `tests/test_salary_input_history.py::TestFieldSetLocked` 鎖死，共 18 欄）。
 * 前端以 `src/constants/__tests__/salaryInputHistory.test.ts` 的寫死快照鎖死；
 * 後端增減欄位時兩邊要一起改，否則漏列的欄位在送出時不會帶 `salary_inputs_effective_from`，
 * 後端會把該次異動當「今天」生效，補算過去月份讀不到新值（QA F1，2026-11-05）。
 *
 * 其中屬於員工表單兩個 tab 的欄位（交集由測試鎖定）：
 * - 基本資料 tab：dependents／job_title_id／position／supervisor_role／bonus_grade
 *   （`title` 不是表單欄位，由後端隨 job_title_id 同步）
 * - 薪資 tab：其餘 12 欄
 */
export const SALARY_INPUT_HISTORY_FIELDS: readonly string[] = Object.freeze([
  'base_salary',
  'labor_insured_salary',
  'health_insured_salary',
  'pension_insured_salary',
  'dependents',
  'pension_self_rate',
  'title',
  'job_title_id',
  'supervisor_role',
  'bonus_grade',
  'position',
  'insurance_salary_level',
  'hourly_rate',
  'bypass_standard_base',
  'health_exempt',
  'no_employment_insurance',
  'health_self_pay_ratio',
  'not_insured',
])

const HISTORY_FIELD_SET: ReadonlySet<string> = new Set(SALARY_INPUT_HISTORY_FIELDS)

/** 欄位名稱清單中是否含任何一個薪資輸入歷史欄（含 → 這次送出需要帶異動生效日）。 */
export const touchesSalaryInputHistory = (fieldNames: Iterable<string>): boolean => {
  for (const name of fieldNames) {
    if (HISTORY_FIELD_SET.has(name)) return true
  }
  return false
}
