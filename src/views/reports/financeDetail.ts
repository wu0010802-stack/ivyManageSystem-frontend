/**
 * 收支下鑽明細的正規化（2026-10-12 報表改版：彈窗改右側抽屜）。
 *
 * 後端 `/reports/finance-summary/detail` 回九個來源；畫面改以「收入／退款／支出」三組、
 * 只列有資料的分類。學費與才藝的退款從原陣列拆出來併成一組「退款」。
 * 薪資、年終、表外獎金金額對非 admin/hr 由後端遮罩為 null：小計遇到 null 標 masked，
 * 不把遮罩當 0 加總。
 */
import type { ApiResponse } from '@/api/_generated/typed'
import { methodLabel } from './reportFormat'

export type FinanceDetail = ApiResponse<'/reports/finance-summary/detail', 'get'>
export type DetailGroup = 'revenue' | 'refund' | 'expense'
export type DetailCategory =
  | 'tuition' | 'activity' | 'misc_receipt'
  | 'refund'
  | 'salary' | 'vendor_payment' | 'fixed_cost' | 'collection_fee' | 'year_end' | 'extra_bonus'

export const CATEGORY_META: Record<DetailCategory, { label: string; group: DetailGroup }> = {
  tuition: { label: '學費', group: 'revenue' },
  activity: { label: '才藝', group: 'revenue' },
  misc_receipt: { label: '雜項收款', group: 'revenue' },
  refund: { label: '退款', group: 'refund' },
  salary: { label: '薪資', group: 'expense' },
  vendor_payment: { label: '廠商付款', group: 'expense' },
  fixed_cost: { label: '固定支出', group: 'expense' },
  collection_fee: { label: '代收手續費', group: 'expense' },
  year_end: { label: '年終', group: 'expense' },
  extra_bonus: { label: '表外獎金', group: 'expense' },
}
export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as DetailCategory[]

export type DetailRow = Record<string, unknown>

function arr(v: unknown): DetailRow[] {
  return Array.isArray(v) ? (v as DetailRow[]) : []
}

export function splitDetail(raw: FinanceDetail | null | undefined): Record<DetailCategory, DetailRow[]> {
  const d = (raw ?? {}) as Record<string, unknown>
  const tuition = arr(d.tuition)
  const activity = arr(d.activity)
  return {
    tuition: tuition.filter(r => r.kind !== 'refund'),
    activity: activity.filter(r => r.kind !== 'refund'),
    misc_receipt: arr(d.misc_receipt),
    refund: [
      ...tuition.filter(r => r.kind === 'refund').map(r => ({ ...r, source: '學費' })),
      ...activity.filter(r => r.kind === 'refund').map(r => ({ ...r, source: '才藝' })),
    ],
    salary: arr(d.salary),
    vendor_payment: arr(d.vendor_payment),
    fixed_cost: arr(d.fixed_cost),
    collection_fee: arr(d.collection_fee),
    year_end: arr(d.year_end),
    extra_bonus: arr(d.extra_bonus),
  }
}

/** 該分類每列計入小計的金額欄（薪資用園方真實支出＝應發＋雇主負擔）。 */
function amountOf(cat: DetailCategory, row: DetailRow): number | null {
  const v = cat === 'salary' ? row.real_cost : row.amount
  return typeof v === 'number' ? v : null
}

export function subtotal(cat: DetailCategory, rows: DetailRow[]): { total: number; masked: boolean } {
  let total = 0
  let masked = false
  for (const r of rows) {
    const a = amountOf(cat, r)
    if (a == null) masked = true
    else total += a
  }
  return { total, masked }
}

/** 依付款方式小計（有 payment_method 的分類才有意義），金額大到小。 */
export function methodBreakdown(rows: DetailRow[]): Array<{ label: string; amount: number }> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (typeof r.amount !== 'number' || !r.payment_method) continue
    const label = methodLabel(String(r.payment_method))
    m.set(label, (m.get(label) || 0) + r.amount)
  }
  return [...m].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
}

const SEARCH_FIELDS = [
  'student_name', 'classroom_name', 'fee_item_name', 'payer_name', 'vendor_name',
  'employee_name', 'description', 'notes', 'channel', 'category_label', 'reason', 'refunded_by',
  'receipt_number', 'receipt_no', 'invoice_number',
]

export function matchesSearch(row: DetailRow, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return SEARCH_FIELDS.some(f => typeof row[f] === 'string' && (row[f] as string).toLowerCase().includes(needle))
}

/** 抽屜開啟時預設選哪個分類：指定組別內第一個有資料的；都沒有就第一個有資料的。 */
export function initialCategory(
  split: Record<DetailCategory, DetailRow[]>,
  group: DetailGroup,
): DetailCategory | null {
  const withData = CATEGORY_ORDER.filter(c => split[c].length > 0)
  return withData.find(c => CATEGORY_META[c].group === group) ?? withData[0] ?? null
}
