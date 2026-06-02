// 招生訪視記錄欄位 prop → 收合區段 key。核心（常駐顯示）回 'core'，不需展開。
// geocoding_consent 為常駐法律同意（不屬任何收合區）→ fallback 'core'。
// 新增欄位時務必在此登記其所屬區段，否則送出驗證失敗時不會自動展開。
export type RecruitmentFormSection = 'core' | 'contact' | 'deposit' | 'notes'

export const RECRUITMENT_FIELD_SECTION: Record<string, RecruitmentFormSection> = {
  // 核心（常駐）
  month: 'core',
  seq_no: 'core',
  child_name: 'core',
  grade: 'core',
  birthday: 'core',
  phone: 'core',
  // 聯絡與來源
  district: 'contact',
  address: 'contact',
  source: 'contact',
  referrer: 'contact',
  // 預繳狀態
  has_deposit: 'deposit',
  deposit_collector: 'deposit',
  enrolled: 'deposit',
  transfer_term: 'deposit',
  no_deposit_reason: 'deposit',
  no_deposit_reason_detail: 'deposit',
  // 備註
  notes: 'notes',
  parent_response: 'notes',
}

export function sectionForRecruitmentField(prop: string): RecruitmentFormSection {
  return RECRUITMENT_FIELD_SECTION[prop] ?? 'core'
}
