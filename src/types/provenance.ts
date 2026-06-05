/**
 * 扣款 provenance（溯源）型別
 * Decimal 欄位依 schema.d.ts SettlementOut 慣例，序列化為 string。
 */

export interface SourceRecord {
  date: string
  label: string
  /** 金額；Decimal 欄位序列化為 string（與 SettlementOut.deduction_total 同慣例） */
  amount: string
  module: string
  source_id: number | null
}

export interface DerivedValue {
  key: string
  /** Decimal 欄位序列化為 string */
  value: string
  formula_summary: string
  breakdown: Record<string, unknown>
  source_records: SourceRecord[]
  deep_link: string | null
  is_override: boolean
  override_meta: Record<string, unknown> | null
}
