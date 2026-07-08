// 學生表單欄位 prop → 收合區段 key。核心欄位（永遠顯示）回 'core'，不需展開。
// 新增欄位時務必在此登記其所屬區段，否則送出驗證失敗時不會自動展開。
export type StudentFormSection =
  | 'core' | 'parent' | 'emergency' | 'health' | 'other' | 'gov'

export const STUDENT_FIELD_SECTION: Record<string, StudentFormSection> = {
  // 核心（永遠顯示）
  student_id: 'core',
  name: 'core',
  gender: 'core',
  birthday: 'core',
  classroom_id: 'core',
  enrollment_date: 'core',
  // 家長資訊
  parent_name: 'parent',
  parent_phone: 'parent',
  address: 'parent',
  // 緊急聯絡人
  emergency_contact_name: 'emergency',
  emergency_contact_phone: 'emergency',
  emergency_contact_relation: 'emergency',
  // 健康資訊
  allergy: 'health',
  medication: 'health',
  special_needs: 'health',
  // 其他
  status_tag: 'other',
  // 政府申報資料
  id_number: 'gov',
  nationality: 'gov',
  household_address: 'gov',
  is_disadvantaged: 'gov',
  is_special_education: 'gov',
  low_income_status: 'gov',
  indigenous_status: 'gov',
  disability_type: 'gov',
  disability_level: 'gov',
  disability_cert_no: 'gov',
  disability_cert_expiry: 'gov',
}

export function sectionForStudentField(prop: string): StudentFormSection {
  return STUDENT_FIELD_SECTION[prop] ?? 'core'
}
