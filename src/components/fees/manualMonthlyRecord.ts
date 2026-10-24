/** 補建月費單表單的純驗證（對齊後端 ManualMonthlyRecordCreate：金額 > 0、原因 10..200 字、月份 YYYY-MM）。 */

export interface ManualMonthlyForm {
  student_id: number | null
  target_month: string
  amount_due: number | undefined
  reason: string
}

export const REASON_MIN = 10
export const REASON_MAX = 200

/** 回傳第一個錯誤訊息；全部合法回 null。 */
export function validateManualMonthly(form: ManualMonthlyForm): string | null {
  if (form.student_id == null) return '請選擇學生'
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(form.target_month)) return '月份格式需為 YYYY-MM'
  if (!Number.isSafeInteger(form.amount_due) || (form.amount_due as number) <= 0) {
    return '金額需大於 0'
  }
  const len = form.reason.trim().length
  if (len < REASON_MIN) return `原因至少 ${REASON_MIN} 字`
  if (len > REASON_MAX) return `原因至多 ${REASON_MAX} 字`
  return null
}
