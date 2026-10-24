/**
 * 節慶未扣餘額（義華 Q14）與節慶發放開關（Q10／Q12）的前端純邏輯。
 *
 * 後端權威：api/salary/festival_carry.py、api/system_config.py（白名單與值驗證）。
 * 此處只做送出前的友善檢查，後端 400／422 仍為最終關卡。
 */

export type ManualEntryType = 'offset_other_bonus' | 'waive'

export const MANUAL_ENTRY_TYPE_OPTIONS: { value: ManualEntryType; label: string; hint: string }[] = [
  {
    value: 'offset_other_bonus',
    label: '改由其他獎金扣抵',
    hint: '已從其他獎金（如自主成長、年終）扣掉這筆餘額；本登記只記帳，不會再動任何獎金金額。',
  },
  {
    value: 'waive',
    label: '沖銷（不再追扣）',
    hint: '園方決定不再追扣這筆餘額；本登記只記帳。',
  },
]

/** 布林開關 → system_configs 值（後端只接受 "true"/"false"）。 */
export function toBoolConfigValue(value: boolean): 'true' | 'false' {
  return value ? 'true' : 'false'
}

/** `YYYY-MM` 格式檢查（後端格式錯誤回 400）。 */
export function isValidYearMonth(value: string | null | undefined): boolean {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export interface ManualEntryDraft {
  entry_type: ManualEntryType | ''
  amount: number | null
  salary_year: number | null
  salary_month: number | null
  note: string
}

/** 人工登記送出前檢查；回傳錯誤訊息，通過回 null。 */
export function validateManualEntry(draft: ManualEntryDraft, balance: number): string | null {
  if (draft.entry_type !== 'offset_other_bonus' && draft.entry_type !== 'waive') return '請選擇登記類型'
  if (draft.amount == null || !Number.isInteger(draft.amount) || draft.amount <= 0) return '金額須為大於 0 的整數'
  if (draft.amount > balance) return `金額不得超過目前餘額 ${balance.toLocaleString('zh-Hant')} 元`
  if (draft.salary_year == null || draft.salary_month == null) return '請選擇歸屬薪資年月'
  if (!Number.isInteger(draft.salary_month) || draft.salary_month < 1 || draft.salary_month > 12) return '歸屬月份不正確'
  if (!draft.note.trim()) return '請填寫備註（說明扣抵來源或沖銷原因）'
  return null
}

/** 異動金額（有號）顯示：正數＝新增待扣、負數＝扣抵／沖銷。 */
export function signedAmountLabel(amount: number): string {
  const abs = Math.abs(amount).toLocaleString('zh-Hant')
  if (amount > 0) return `+${abs}`
  if (amount < 0) return `−${abs}`
  return '0'
}
