/**
 * 收支簽收（廠商付款／雜項收款）共用常數。
 * 原本 PAYMENT_METHOD_OPTIONS / paymentMethodLabel 在 vendorPayment.ts 與
 * miscReceipt.ts 重複定義（值相同），Summary interface 亦兩檔各一份；
 * 收斂於此，兩 api 模組 re-export 維持既有 import 路徑。
 */
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: '現金' },
  { value: 'bank_transfer', label: '銀行匯款' },
  { value: 'check', label: '支票' },
  { value: 'linepay', label: 'LINE Pay' },
  { value: 'other', label: '其他' },
]

export const paymentMethodLabel = (value: string) =>
  PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label || value

export const CATEGORY_OPTIONS = [
  { value: 'rent', label: '場地租金' },
  { value: 'donation', label: '捐款' },
  { value: 'subsidy', label: '補助款' },
  { value: 'secondhand_sale', label: '二手義賣' },
  { value: 'refund_recovery', label: '退費回收' },
  { value: 'other', label: '其他' },
]

export const categoryLabel = (value: string) =>
  CATEGORY_OPTIONS.find((o) => o.value === value)?.label || value

export const VENDOR_CATEGORY_OPTIONS = [
  { value: '餐點食材', label: '餐點食材' },
  { value: '教材教具', label: '教材教具' },
  { value: '清潔衛生', label: '清潔衛生' },
  { value: '維修設備', label: '維修設備' },
  { value: '文具事務', label: '文具事務' },
  { value: '活動支出', label: '活動支出' },
  { value: '其他', label: '其他' },
] as const

export const vendorCategoryLabel = (value: string) =>
  VENDOR_CATEGORY_OPTIONS.find((o) => o.value === value)?.label || value

/** 區間彙總（跨狀態），對應後端 GET /vendor-payments/summary 與 /misc-receipts/summary（shape 相同）。 */
export interface SignoffSummary {
  total_count: number
  total_amount: number
  pending_count: number
  pending_amount: number
  signed_count: number
  signed_amount: number
}
