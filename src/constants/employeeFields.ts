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
  'labor_insured_salary',
  'health_insured_salary',
  'pension_insured_salary',
  'not_insured',
  'health_self_pay_ratio',
  'ece_program_enrolled',
  'health_exempt',
  'no_employment_insurance',
  'dependents',
  'work_start_time',
  'work_end_time',
  'birthday',
  'bypass_standard_base',
  'skip_payroll_bonuses',
  'resign_date',
  'is_active',
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
])

// 編輯 dialog「基本資料」tab 涵蓋的欄位
export const BASIC_TAB_FIELDS = Object.freeze([
  'employee_id',
  'name',
  'english_name',
  'id_number',
  'employee_type',
  'job_title_id',
  'position',
  'supervisor_role',
  'bonus_grade',
  // classroom_id 不在此列：2026-07-28 起員工表單唯讀顯示班級，
  // 後端 PUT 也不再接受（唯一維護者 = 班級頁指派觸發的 classroom_teacher_sync）
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
  // 義華 R2 #42：不投保（承攬／自行投保）
  'not_insured',
  // 義華 2026-10-27：目前就讀幼保相關科系（節慶 C 級滿二年比照 B 級規則用；後端列為薪資輸入與自改敏感欄位）
  'ece_program_enrolled',
  // 義華 115.09 對帳 #36：健保本人自付比例
  'health_self_pay_ratio',
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
