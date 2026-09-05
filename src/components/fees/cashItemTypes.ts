/**
 * 現金項目（SPEC-019 §7）共用型別與標籤：教材費等只收現金的批次。
 */
import type { FeeSettlement } from './settlementDisplay'

export type CashFeeKind = 'material' | 'miscellaneous' | 'registration'

export const CASH_FEE_KIND_LABELS: Record<CashFeeKind, string> = {
  registration: '新生註冊費',
  material: '教材／耗材費',
  miscellaneous: '其他現金項目',
}

export const CASH_FEE_KIND_OPTIONS = (Object.keys(CASH_FEE_KIND_LABELS) as CashFeeKind[]).map(
  (key) => ({ key, label: CASH_FEE_KIND_LABELS[key] }),
)

export interface CashFeeBatchRow {
  id: number
  kind: CashFeeKind
  title: string
  school_year: number
  semester: number
  due_date: string | null
  note: string | null
  created_at: string
  student_count: number
  total_due: number
  total_paid: number
  outstanding: number
}

export interface CashFeeEntryRow {
  student_id: number
  student_name: string
  classroom_name: string | null
  grade_name: string | null
  amount: number
}

export interface CashFeeBatchItemRow {
  record_id: number
  student_id: number
  student_name: string | null
  classroom_name: string | null
  amount_due: number
  amount_paid: number
  status: string
  settlement: FeeSettlement
}
