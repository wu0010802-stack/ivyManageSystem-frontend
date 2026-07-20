/** 退回按鈕權限矩陣：status → 所需權限（鏡射 BE _resolve_settlement_reject_permission）。 */
export const rejectableStages: Record<string, string> = {
  SUPERVISOR_SIGNED: 'YEAR_END_REVIEW',
  ACCOUNTING_SIGNED: 'YEAR_END_ACCOUNTING',
  FINALIZED: 'YEAR_END_FINALIZE',
}

export interface BatchFailedItem {
  settlement_id: number
  reason: string
}

/** 批次簽核 failed 明細 → 「姓名：原因」清單（後端已回傳明細，前端不再只給計數）。 */
export function formatBatchFailures(
  failed: BatchFailedItem[],
  rows: Array<{ id: number; employee_name?: string }>,
): string[] {
  const nameById = new Map(rows.map((r) => [r.id, r.employee_name]))
  return failed.map((f) => {
    const name = nameById.get(f.settlement_id)
    return `${name ?? `結算單 #${f.settlement_id}`}：${f.reason}`
  })
}
