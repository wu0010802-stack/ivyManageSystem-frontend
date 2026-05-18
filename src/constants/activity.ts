/**
 * 才藝系統共用常數
 * 集中定義所有狀態對應的 tag type 與 label，避免各元件重複定義。
 */

export const PAYMENT_STATUS_TAG_TYPE = {
  paid:    'success',
  partial: 'warning',
  overpaid:'danger',
  unpaid:  'danger',
}

export const PAYMENT_STATUS_LABEL = {
  paid:    '已繳費',
  partial: '部分繳費',
  overpaid:'超繳',
  unpaid:  '未繳費',
}

export const COURSE_STATUS_TAG_TYPE = {
  enrolled: 'success',
  waitlist: 'info',
  promoted_pending: 'warning',
}

export const COURSE_STATUS_LABEL = {
  enrolled: '正式',
  waitlist: '候補',
  promoted_pending: '待家長確認',
}

export const PAYMENT_METHODS = ['現金', '轉帳', '其他']

export const APPROVAL_STATUS_LABEL = {
  fully_approved:     '已簽核',
  partially_approved: '部分簽核',
  pending_approval:   '待簽核',
  no_payment:         '尚未繳費',
}

export const APPROVAL_STATUS_TAG_TYPE = {
  fully_approved:     'success',
  partially_approved: 'warning',
  pending_approval:   'danger',
  no_payment:         'info',
}

// 表單欄位限制（與後端 schema 一致；變更時兩端需同步）
export const FIELD_RULES = {
  studentNameMax: 50,
  emailMax: 200,
  remarkMax: 500,
  paymentAmountMax: 999999,
  voidReasonMin: 5,
  voidReasonMax: 200,
  unlockReasonMin: 10,
}

// 軟刪除繳費紀錄原因的正則（≥5 字 ≤200 字）
export const VOID_REASON_PATTERN = new RegExp(
  `.{${FIELD_RULES.voidReasonMin},${FIELD_RULES.voidReasonMax}}`
)

// 解鎖日結原因的正則（≥10 字）
export const UNLOCK_REASON_PATTERN = new RegExp(
  `.{${FIELD_RULES.unlockReasonMin},}`
)

// 滿勤獎金門檻（後端 grade.subtotal.bonus = 1000 代表達成 100% 出席）
export const FULL_ATTENDANCE_BONUS = 1000
