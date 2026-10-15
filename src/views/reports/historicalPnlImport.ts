import type { HistoricalPnlImport } from '@/api/historicalPnl'

export const MAX_HISTORICAL_PNL_BYTES = 1024 * 1024
export const HISTORICAL_PNL_FORMAT_ERROR = '請選擇本年度整理後的損益 JSON，並確認檔案格式。'

const ROOT_KEYS = ['source_name', 'source_sha256', 'basis_note', 'year', 'months']
const MONTH_KEYS = ['month', 'revenue', 'expense', 'profit', 'rows']
const ROW_KEYS = ['key', 'label', 'section', 'role', 'parent_key', 'amount', 'source_cell', 'direct_flags']
const FLAGS = ['estimate', 'amortized', 'full_nhi_amount', 'fixed_contribution_filled']

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}
function key(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}
function amount(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && /^-?\d+(?:\.\d{1,2})?$/.test(value)
}
function row(value: unknown): boolean {
  return record(value) && exactKeys(value, ROW_KEYS)
    && key(value.key) && text(value.label, 150)
    && typeof value.section === 'string' && ['income', 'expense', 'profit', 'personnel_breakdown'].includes(value.section)
    && typeof value.role === 'string' && ['detail', 'subtotal', 'total'].includes(value.role)
    && (value.parent_key === null || key(value.parent_key))
    && (value.amount === null || amount(value.amount)) && text(value.source_cell, 80)
    && Array.isArray(value.direct_flags) && value.direct_flags.length <= 4
    && value.direct_flags.every(flag => typeof flag === 'string' && FLAGS.includes(flag))
}
function month(value: unknown): boolean {
  return record(value) && exactKeys(value, MONTH_KEYS)
    && typeof value.month === 'number' && Number.isInteger(value.month) && value.month >= 1 && value.month <= 12
    && amount(value.revenue) && amount(value.expense) && amount(value.profit)
    && Array.isArray(value.rows) && value.rows.length >= 3 && value.rows.length <= 200 && value.rows.every(row)
}
function validPayload(value: unknown, year: number): value is HistoricalPnlImport {
  if (!record(value) || !exactKeys(value, ROOT_KEYS)) return false
  if (!text(value.source_name, 200) || /[\/\\\x00-\x1f]/.test(value.source_name) || ['.', '..'].includes(value.source_name)) return false
  if (typeof value.source_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.source_sha256)) return false
  if (!text(value.basis_note, 1000) || value.year !== year) return false
  if (!Array.isArray(value.months) || value.months.length < 1 || value.months.length > 12 || !value.months.every(month)) return false
  return new Set(value.months.map(item => (item as Record<string, unknown>).month)).size === value.months.length
}

/** 只檢查可送出的形狀與白名單；金額等式、科目樹及重複資料由後端預覽裁定。 */
export function parseHistoricalPnlImport(json: string, year: number): HistoricalPnlImport {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error(HISTORICAL_PNL_FORMAT_ERROR)
  }
  if (!validPayload(value, year)) throw new Error(HISTORICAL_PNL_FORMAT_ERROR)
  return value
}
