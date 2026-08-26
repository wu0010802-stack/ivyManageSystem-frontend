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

export interface CoveragePair {
  payment_id: number | null
  transaction_id: number
  amount: number
  /** per_row＝逐筆銷帳編號比對；day_total＝當日淨額小計（無編號的整批列） */
  match_mode: string
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

// ── 發單快照與未繳差集（SPEC-016 Phase 3）────────────────────────────

export interface BillSlipBatchRow {
  id: number
  batch_no: string | null
  bill_year: number
  bill_month: number
  title: string
  source: string
  original_filename: string | null
  row_count: number
  net_total: number
  zero_amount_count: number
  note: string | null
  created_at: string
  created?: boolean | null
}

export interface BillSlipPreview {
  bill_year: number | null
  bill_month: number | null
  row_count: number
  net_total: number
  zero_amount_count: number
  error_count: number
  errors: { row_number: number; reason: string }[]
  already_imported: boolean
  existing_batch_id: number | null
  /** 同期別既有批次的帳號重疊（高比例多半是同一批重傳 → 應收會雙計） */
  overlap_count: number
  overlap_ratio: number
  overlap_batch_ids: number[]
}

export interface OutstandingItem {
  item_id: number
  student_id: number | null
  student_name: string
  classroom_name: string | null
  grade_name: string | null
  collection_suffix: string
  full_collection_number: string
  /** 本批該帳號應收 */
  net_amount: number
  /** 同期別跨批應收合計（狀態判定基準；帳號被多批共用） */
  expected_total: number
  paid_amount: number
  shortfall: number
  excess: number
  status: string
}

/**
 * 差集報表中的批次投影——**不是** BillSlipBatchRow 的超集。
 * 後端 OutstandingBatchOut 刻意不含 note/original_filename/created
 * （那三個屬匯入語境，報表用不到），宣告成交集才不會誤導後續開發。
 */
export interface OutstandingBatchInfo {
  id: number
  title: string
  batch_no: string | null
  bill_year: number
  bill_month: number
  source: string
  row_count: number
  net_total: number
  zero_amount_count: number
  created_at: string
  /** 同期別其他批次數（>0 表示帳號與其他批共用，狀態已跨批判定） */
  sibling_batch_count: number
  /** 大量溢繳＋同期別無其他批次＝多半是另一批發單快照還沒匯入 */
  likely_missing_sibling_batch: boolean
}

export interface OutstandingReport {
  batch: OutstandingBatchInfo
  totals: {
    expected: number
    paid: number
    outstanding: number
    excess: number
    row_count: number
    settled_count: number
    unpaid_count: number
    partial_count: number
    paid_count: number
    overpaid_count: number
  }
  items: OutstandingItem[]
}

export const OUTSTANDING_STATUS_LABELS: Record<string, string> = {
  settled: '已收訖',
  unpaid: '未繳',
  partial: '短繳',
  paid: '足額',
  overpaid: '溢繳',
}

/** 未繳名單快篩（第一個為預設：優先看需要催的） */
export const OUTSTANDING_SCOPES: { value: string; label: string }[] = [
  { value: 'unpaid', label: '未繳' },
  { value: 'partial', label: '短繳' },
  { value: 'overpaid', label: '溢繳' },
  { value: 'paid', label: '足額' },
  { value: 'settled', label: '已收訖' },
  { value: '', label: '全部' },
]

export function outstandingStatusTag(
  status: string,
): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  if (status === 'paid') return 'success'
  if (status === 'settled') return 'info'
  if (status === 'partial') return 'warning'
  if (status === 'overpaid') return 'primary'
  return 'danger'
}
