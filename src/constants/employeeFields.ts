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
  'gender',
  'email',
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
  // 教保身分（政府申報用）
  'staff_role_category',
  'teacher_cert_no',
  'teacher_cert_type',
])

// 編輯 dialog「薪資」tab 涵蓋的欄位
export const SALARY_TAB_FIELDS = Object.freeze([
  'base_salary',
  'hourly_rate',
  'insurance_salary_level',
  'insurance_effective_date',
  'pension_self_rate',
  'bank_code',
  'bank_account',
  'bank_account_name',
  // 階段 2-C：特殊投保/獎金狀態旗標
  'no_employment_insurance',
  'health_exempt',
  'skip_payroll_bonuses',
  'skip_payroll_transfer',
  'unreported_for_tax',
  'insurance_salary_override_reason',
  // 議題 A 選項 3：底薪標準化覆寫
  'bypass_standard_base',
  // 議題 B：分項投保
  'labor_insured_salary',
  'health_insured_salary',
  'pension_insured_salary',
])
