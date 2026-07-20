/** 退回按鈕權限矩陣：status → 所需權限（鏡射 BE _resolve_settlement_reject_permission）。 */
export const rejectableStages: Record<string, string> = {
  SUPERVISOR_SIGNED: 'YEAR_END_REVIEW',
  ACCOUNTING_SIGNED: 'YEAR_END_ACCOUNTING',
  FINALIZED: 'YEAR_END_FINALIZE',
}
