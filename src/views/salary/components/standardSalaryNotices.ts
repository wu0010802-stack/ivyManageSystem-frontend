// 職位標準底薪 tab 的提示文字組裝（純函式，方便單元測試）。
//
// 義華 2026-10-22 薪資比對：
// - #54 帶班但職稱與等級皆空白 → 等級預設 C；後端 sync 對這類「調降」預設略過，
//   回傳 needs_confirmation，須逐筆明確確認才寫回主檔。
// - #61 職位標準低於該年度基本工資 → PUT 回傳 below_minimum_wage（示警不擋儲存）。

export interface BelowMinimumWageRow {
  key: string
  value: number
  minimum: number
}

export interface NeedsConfirmationRow {
  employee_id: number
  name: string
  current_salary: number
  standard_salary: number
  warning?: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function pickBelowMinimumWage(data: unknown): BelowMinimumWageRow[] {
  if (!isRecord(data) || !Array.isArray(data.below_minimum_wage)) return []
  return data.below_minimum_wage.filter(
    (r): r is BelowMinimumWageRow =>
      isRecord(r) && typeof r.key === 'string' && typeof r.value === 'number' && typeof r.minimum === 'number',
  )
}

export function pickNeedsConfirmation(data: unknown): NeedsConfirmationRow[] {
  if (!isRecord(data) || !Array.isArray(data.needs_confirmation)) return []
  return data.needs_confirmation.filter(
    (r): r is NeedsConfirmationRow => isRecord(r) && typeof r.employee_id === 'number' && typeof r.name === 'string',
  )
}

export function describeBelowMinimumWage(
  rows: BelowMinimumWageRow[],
  labels: Record<string, string>,
): string | null {
  if (!rows.length) return null
  const minimum = rows[0].minimum
  const parts = rows.map((r) => `${labels[r.key] ?? r.key} $${r.value.toLocaleString()}`)
  return `以下職位標準低於該年度基本工資 $${minimum.toLocaleString()}：${parts.join('、')}`
}

export function describeNeedsConfirmation(rows: NeedsConfirmationRow[]): string | null {
  if (!rows.length) return null
  const names = rows.map((r) => r.name).join('、')
  return `${rows.length} 位帶班但職稱與等級皆空白（將以 C 級計），未自動調降：${names}。請先補報聘職稱或等級，或在比對表逐筆確認同步。`
}

/** 比對列是否為「預設 C 級且同步會調降底薪」→ 同步前須確認。 */
export function requiresGradeDefaultConfirm(row: Record<string, unknown>): boolean {
  return row.grade_defaulted === true && typeof row.diff === 'number' && row.diff > 0
}

// 使用者 2026-10-28 裁定：POST /config/position-salary/sync 同步到員工個人底薪時
// 任一員工低於基本工資即整批 422（不部分寫入），detail 結構化列出阻擋名單。
export const SYNC_BELOW_MINIMUM_WAGE = 'SYNC_BELOW_MINIMUM_WAGE'

export interface SyncMinimumWageBlockedEmployee {
  employee_id: number
  name: string
  new_salary: number
  minimum: number
  shortfall: number
}

export interface SyncMinimumWageBlock {
  message: string
  employees: SyncMinimumWageBlockedEmployee[]
}

/** 從 axios error 取出「同步後低於基本工資」的結構化 422；其他錯誤回 null。 */
export function pickSyncMinimumWageBlock(err: unknown): SyncMinimumWageBlock | null {
  if (!isRecord(err) || !isRecord(err.response)) return null
  const { status, data } = err.response
  if (status !== 422 || !isRecord(data) || !isRecord(data.detail)) return null
  const detail = data.detail
  if (detail.code !== SYNC_BELOW_MINIMUM_WAGE || !Array.isArray(detail.employees)) return null
  const employees = detail.employees.filter(
    (r): r is SyncMinimumWageBlockedEmployee =>
      isRecord(r) &&
      typeof r.name === 'string' &&
      typeof r.new_salary === 'number' &&
      typeof r.minimum === 'number' &&
      typeof r.shortfall === 'number',
  )
  return {
    message: typeof detail.message === 'string' ? detail.message : '同步後底薪低於法定基本工資，整批未同步',
    employees,
  }
}
