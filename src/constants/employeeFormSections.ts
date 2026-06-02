// 欄位 prop → 收合區段 key。核心欄位（永遠顯示）回 'core'，不需展開。
// 新增欄位時務必在此登記其所屬區段，否則送出驗證失敗時不會自動展開。
export type EmployeeFormSection =
  | 'core' | 'jobDetail' | 'personal' | 'worktime' | 'gov' | 'salary'

export const EMPLOYEE_FIELD_SECTION: Record<string, EmployeeFormSection> = {
  // 核心（永遠顯示）
  name: 'core',
  employee_id: 'core',
  job_title_id: 'core',
  employee_type: 'core',
  hire_date: 'core',
  classroom_id: 'core',
  // 職務細節
  position: 'jobDetail',
  supervisor_role: 'jobDetail',
  department: 'jobDetail',
  bonus_grade: 'jobDetail',
  probation_end_date: 'jobDetail',
  // 個資・聯絡・緊急聯絡
  birthday: 'personal',
  id_number: 'personal',
  phone: 'personal',
  address: 'personal',
  dependents: 'personal',
  emergency_contact_name: 'personal',
  emergency_contact_phone: 'personal',
  // 工作時間
  work_start_time: 'worktime',
  work_end_time: 'worktime',
  // 教保身分・政府申報
  staff_role_category: 'gov',
  teacher_cert_no: 'gov',
  teacher_cert_type: 'gov',
  // 薪資・投保・銀行
  base_salary: 'salary',
  hourly_rate: 'salary',
  insurance_salary_level: 'salary',
  pension_self_rate: 'salary',
  bank_code: 'salary',
  bank_account: 'salary',
  bank_account_name: 'salary',
  labor_insured_salary: 'salary',
  health_insured_salary: 'salary',
  pension_insured_salary: 'salary',
  extra_dependents_quarterly: 'salary',
  insurance_salary_override_reason: 'salary',
}

export function sectionForField(prop: string): EmployeeFormSection {
  return EMPLOYEE_FIELD_SECTION[prop] ?? 'core'
}

export function sectionsForInvalidFields(props: string[]): EmployeeFormSection[] {
  const set = new Set<EmployeeFormSection>()
  for (const p of props) set.add(sectionForField(p))
  return [...set]
}
