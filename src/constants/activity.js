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
}

export const COURSE_STATUS_LABEL = {
  enrolled: '正式',
  waitlist: '候補',
}

export const PAYMENT_METHODS = ['現金', '轉帳', '其他']
