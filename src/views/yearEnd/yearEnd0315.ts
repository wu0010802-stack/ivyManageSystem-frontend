/**
 * 年終第二批（yearend2）純邏輯：週期規則（扣款期間起始月／在職基準日）與
 * 3/15 重算多退少補差額的顯示判定。
 *
 * 金額欄位後端為 Decimal → JSON 字串（例 "1234.00"、"-500"），一律經 toAmount 轉數字。
 */

export type AdjustmentStatus = 'PENDING' | 'SETTLED' | 'WAIVED'

export const ADJUSTMENT_STATUS_LABEL: Record<AdjustmentStatus, string> = {
  PENDING: '待處理',
  SETTLED: '已處理',
  WAIVED: '免追／免補',
}

export const ADJUSTMENT_STATUS_TAG: Record<AdjustmentStatus, 'warning' | 'success' | 'info'> = {
  PENDING: 'warning',
  SETTLED: 'success',
  WAIVED: 'info',
}

export function adjustmentStatusLabel(status: string): string {
  return ADJUSTMENT_STATUS_LABEL[status as AdjustmentStatus] ?? status
}

export function adjustmentStatusTag(status: string): 'warning' | 'success' | 'info' {
  return ADJUSTMENT_STATUS_TAG[status as AdjustmentStatus] ?? 'info'
}

/** Decimal 字串／數字 → number；無法解析回 0。 */
export function toAmount(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export type DiffDirection = 'payout' | 'recovery' | 'none'

/** 差額方向：正＝待表外補發、負＝待追回（不可從月薪扣）、0＝無差額。 */
export function diffDirection(diff: string | number | null | undefined): DiffDirection {
  const n = toAmount(diff)
  if (n > 0) return 'payout'
  if (n < 0) return 'recovery'
  return 'none'
}

export function diffDirectionLabel(diff: string | number | null | undefined): string {
  const d = diffDirection(diff)
  if (d === 'payout') return '待表外補發'
  if (d === 'recovery') return '待人工追回'
  return '無差額'
}

export interface AdjustmentLike {
  diff_amount: string
  status: string
}

/** 依狀態彙總待處理差額（補發總額為正、追回總額取絕對值）。 */
export function summarizePendingAdjustments(rows: readonly AdjustmentLike[]): {
  pendingCount: number
  pendingPayout: number
  pendingRecovery: number
} {
  let pendingCount = 0
  let pendingPayout = 0
  let pendingRecovery = 0
  for (const r of rows) {
    if (r.status !== 'PENDING') continue
    pendingCount += 1
    const n = toAmount(r.diff_amount)
    if (n > 0) pendingPayout += n
    else if (n < 0) pendingRecovery += -n
  }
  return { pendingCount, pendingPayout, pendingRecovery }
}

/** 扣款期間起始月說明：1＝曆年 1–12 月；其他＝M 月～隔年 (M-1) 月。 */
export function deductionPeriodLabel(startMonth: number | null | undefined): string {
  const m = startMonth ?? 1
  if (m === 1) return '曆年 1–12 月'
  const prev = m - 1
  return `${m} 月～隔年 ${prev} 月`
}

export interface CycleRulesState {
  deduction_period_start_month: number
  employment_cutoff_date: string | null
}

/**
 * 組 PUT /cycles/{id}/rules body：只送有改的欄位（後端以 fields_set 區分「不異動」與
 * 「清除」）。基準日空字串視同 null（清除）。無任何變更回 null。
 */
export function buildCycleRulesPatch(
  original: CycleRulesState,
  edited: CycleRulesState,
): { deduction_period_start_month?: number; employment_cutoff_date?: string | null } | null {
  const body: { deduction_period_start_month?: number; employment_cutoff_date?: string | null } = {}
  if (edited.deduction_period_start_month !== original.deduction_period_start_month) {
    body.deduction_period_start_month = edited.deduction_period_start_month
  }
  const before = original.employment_cutoff_date || null
  const after = edited.employment_cutoff_date || null
  if (after !== before) body.employment_cutoff_date = after
  return Object.keys(body).length > 0 ? body : null
}

/** 員工 id 清單 → 顯示名（查無名稱時顯示 #id）。 */
export function employeeNames(ids: readonly number[], nameById: ReadonlyMap<number, string>): string[] {
  return ids.map((id) => nameById.get(id) ?? `#${id}`)
}
