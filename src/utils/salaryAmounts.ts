/**
 * 薪資畫面與銀行名冊共用的現金到手口徑。
 *
 * `net_salary` / records API 的 `net_pay` 都只代表 gross - deduction；
 * `unused_leave_payout` 刻意不進 gross/net，但仍是本月真實給付，會併入主薪轉。
 */
function amount(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function computeBaseTransferAmount(
  salary: Record<string, unknown> | null | undefined,
): number {
  if (!salary) return 0
  const netSalary = salary.net_pay ?? salary.net_salary
  return amount(netSalary) + amount(salary.unused_leave_payout)
}

export function computeTotalTakeHomeAmount(
  salary: Record<string, unknown> | null | undefined,
): number {
  if (!salary) return 0
  return (
    computeBaseTransferAmount(salary) +
    amount(salary.festival_bonus) +
    amount(salary.overtime_bonus)
  )
}
