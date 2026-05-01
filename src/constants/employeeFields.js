/**
 * 員工編輯相關欄位常數
 * 後端 source of truth：utils/finance_guards.EMPLOYEE_SALARY_SENSITIVE_FIELDS
 */

// 薪資敏感欄位（修改需額外審核）
export const SALARY_SENSITIVE_FIELDS = Object.freeze([
  'base_salary',
  'hourly_rate',
  'employee_type',
  'hire_date',
  'job_title_id',
  'title',
  'position',
  'supervisor_role',
  'bonus_grade',
  'classroom_id',
  'insurance_salary_level',
  'pension_self_rate',
])

// 「員工本人」可編輯的欄位（B 中度版）
export const SELF_EDITABLE_FIELDS = Object.freeze([
  'name',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'bank_code',
  'bank_account',
  'bank_account_name',
  'birthday',
])

// 編輯 dialog「基本資料」tab 涵蓋的欄位
export const BASIC_TAB_FIELDS = Object.freeze([
  'employee_id',
  'name',
  'id_number',
  'employee_type',
  'job_title_id',
  'position',
  'supervisor_role',
  'bonus_grade',
  'classroom_id',
  'department',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'hire_date',
  'probation_end_date',
  'birthday',
  'work_start_time',
  'work_end_time',
  'dependents',
])

// 編輯 dialog「薪資」tab 涵蓋的欄位
export const SALARY_TAB_FIELDS = Object.freeze([
  'base_salary',
  'hourly_rate',
  'insurance_salary_level',
  'pension_self_rate',
  'bank_code',
  'bank_account',
  'bank_account_name',
])
