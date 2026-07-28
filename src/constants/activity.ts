/**
 * 才藝系統共用常數
 * 集中定義所有狀態對應的 tag type 與 label，避免各元件重複定義。
 */
import { CASH_METHOD } from './pos'

export const PAYMENT_STATUS_TAG_TYPE = {
  paid:    'success',
  partial: 'warning',
  overpaid:'danger',
  unpaid:  'danger',
  no_fee:  'info',
}

export const PAYMENT_STATUS_LABEL = {
  paid:    '已繳費',
  partial: '部分繳費',
  overpaid:'超繳',
  unpaid:  '未繳費',
  // 業主裁定 B 口徑（0 元不算結清）：total=0 且未繳（全候補 / 0 元課程）→ 中性「免繳」，
  // 與後端 _derive_payment_status 的 no_fee 對齊；不顯示「已繳費」避免誤導與篩選漂移。
  no_fee:  '免繳',
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

// 匹配狀態（match_status）收斂：原本散落在 ActivityRegistrationView（短文案）與
// RegistrationTimeline（較長變體）兩處各自定義。集中為「共用 tag type + 短/長兩套
// label」，兩處各取所需，避免文案漂移。
export const MATCH_STATUS_TAG_TYPE = {
  matched:   'success',
  manual:    'primary',
  pending:   'warning',
  rejected:  'info',
  unmatched: 'info',
  forced:    'danger',
}

// admin 列表用短文案（窄欄位）
export const MATCH_STATUS_LABEL_SHORT = {
  matched:   '系統自動',
  manual:    '人工指定',
  pending:   '待審核',
  rejected:  '已拒絕',
  unmatched: '未比對',
  forced:    '強行收件',
}

// timeline 用較詳細文案（含說明語）
export const MATCH_STATUS_LABEL_LONG = {
  matched:   '系統自動匹配',
  manual:    '人工綁定學生',
  pending:   '等待校方審核',
  rejected:  '已拒絕（視為校外生）',
  unmatched: '舊資料、未比對',
  forced:    '強行收件（校外生）',
}

// 後端才藝 POS 為 cash-only（payment_method: Literal["現金"]）；選非現金送出會 422。
// 收斂成只剩現金與後端契約對齊；未來後端支援多付款方式時再加回轉帳/其他。
// 2026-07-28：改引用 pos.ts 的 CASH_METHOD，消除同值雙寫。
export const PAYMENT_METHODS = [CASH_METHOD]

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
  // 軟刪 payment（VoidPaymentRequest）原因門檻：後端 MIN_VOID_REASON_LENGTH=5
  voidReasonMin: 5,
  voidReasonMax: 200,
  // 退費 / 自動沖帳 / 批次補齊原因門檻：後端 MIN_REFUND_REASON_LENGTH=15
  // （require_refund_reason / BatchPaymentUpdate.reason / AddPaymentRequest）。
  // 嚴於軟刪，因退費直接影響財務流水；勿與 voidReasonMin 混用。
  refundReasonMin: 15,
  refundReasonMax: 200,
  unlockReasonMin: 10,
}

// 軟刪除繳費紀錄原因的正則（≥5 字 ≤200 字）
export const VOID_REASON_PATTERN = new RegExp(
  `.{${FIELD_RULES.voidReasonMin},${FIELD_RULES.voidReasonMax}}`
)

// 退費 / 自動沖帳 / 批次補齊原因的正則（≥15 字 ≤200 字，對齊後端 15 字硬限）
export const REFUND_REASON_PATTERN = new RegExp(
  `.{${FIELD_RULES.refundReasonMin},${FIELD_RULES.refundReasonMax}}`
)

// 自動沖帳（force refund）二次確認 prompt 的共用設定：退課 / 刪報名 / 移除用品三處
// 沖帳原因規則完全相同，僅 confirmButtonText 不同。集中此處避免三處各自誤用
// voidReasonMin(5) 而被後端 15 字硬限 422。
export function forceRefundReasonPromptOptions(confirmButtonText: string) {
  return {
    type: 'warning' as const,
    confirmButtonText,
    cancelButtonText: '取消',
    inputPattern: REFUND_REASON_PATTERN,
    inputErrorMessage: `原因必須 ${FIELD_RULES.refundReasonMin}-${FIELD_RULES.refundReasonMax} 個字，不可敷衍`,
    confirmButtonClass: 'el-button--danger',
  }
}

// 解鎖日結原因的正則（≥10 字）
export const UNLOCK_REASON_PATTERN = new RegExp(
  `.{${FIELD_RULES.unlockReasonMin},}`
)

// 滿勤獎金門檻（後端 grade.subtotal.bonus 達此值代表達成 100% 出席）。
// 須與後端 ivy-backend utils/activity_constants.py GRADE_TARGET_BONUS 一致。
export const FULL_ATTENDANCE_BONUS = 1000
