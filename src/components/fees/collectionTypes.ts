/** SPEC-016 代收明細共用型別與顯示常數。 */

export interface CollectionPaymentRow {
  id: number
  import_id: number
  customer_paid_date: string
  channel: string
  gross_amount: number
  net_amount: number
  fee_amount: number
  collection_suffix: string | null
  bill_year: number | null
  bill_month: number | null
  posting_date: string
  expected_posting_date: string | null
  occurrence_index: number
  reconciliation_status: string
  status_note: string | null
  allocated_total: number
  unallocated: number
}

export interface CollectionImportPreview {
  statement_start: string | null
  statement_end: string | null
  row_count: number
  gross_total: number
  net_total: number
  fee_total: number
  decoded_count: number
  old_period_count: number
  duplicate_count: number
  error_count: number
  already_imported: boolean
  parser_version: string
}

export interface CoverageDay {
  posting_date: string
  collection_net_total: number
  collection_count: number
  passbook_total: number
  difference: number
  matched: boolean
  transaction_ids: number[]
}

export const COLLECTION_STATUS_LABELS: Record<string, string> = {
  imported: '待媒合',
  suggested: '有候選',
  partially_allocated: '部分分配',
  allocated: '已分配',
  unmatched: '未媒合',
  reversed: '已沖銷',
}

/** 檢視快篩（後端 status 為單值篩選 → 每個 chip 一次伺服器查詢）。 */
export const COLLECTION_SCOPES: { value: string; label: string }[] = [
  { value: 'imported', label: '待媒合' },
  { value: 'partially_allocated', label: '部分分配' },
  { value: 'allocated', label: '已分配' },
  { value: '', label: '全部' },
]

export const COLLECTION_PENDING_STATUSES = new Set([
  'imported',
  'suggested',
  'unmatched',
  'partially_allocated',
])

/** 帳單期別顯示（14 碼銷帳編號解碼結果）。 */
export function billPeriodLabel(row: {
  bill_year: number | null
  bill_month: number | null
}): string {
  if (!row.bill_year || !row.bill_month) return '—'
  return `${row.bill_year}-${String(row.bill_month).padStart(2, '0')}`
}

/** 帳單期別早於顧客繳費月＝舊期別帳號繳款（需人工確認）。 */
export function isOldPeriod(row: {
  bill_year: number | null
  bill_month: number | null
  customer_paid_date: string
}): boolean {
  if (!row.bill_year || !row.bill_month) return false
  const [y, m] = row.customer_paid_date.split('-').map(Number)
  if (!y || !m) return false
  return row.bill_year * 12 + row.bill_month < y * 12 + m
}
