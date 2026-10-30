/**
 * 薪資畫面與銀行名冊共用的現金到手口徑。
 *
 * `net_salary` / records API 的 `net_pay` 都只代表 gross - deduction；
 * `unused_leave_payout` 刻意不進 gross/net，但仍是本月真實給付，會併入主薪轉。
 *
 * 權威來源是後端 `services/salary/amounts.py::base_transfer_amount`
 * （net_salary + unused_leave_payout）。畫面用到的回應現在都帶 `base_transfer_amount`：
 * 快照列表 SalarySnapshotSummaryOut、快照明細 SalarySnapshotDetailOut、
 * GET /salaries/records 的 SalaryRecordItemOut（2026-10-30 補上），以及月總覽、歷史、portal。
 * 有後端值就一律用後端值。
 *
 * 前端公式只剩「前後端部署有時間差、舊後端還沒回這個欄位」時的退路，金額與後端同式。
 * 後端上線後可以把退路拿掉（`__tests__/salaryAmounts.test.ts` 有一條會釘住
 * schema.d.ts 仍宣告這個欄位）。改公式前先改後端 helper，兩邊必須同式。
 */
function amount(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function computeBaseTransferAmount(
  salary: Record<string, unknown> | null | undefined,
): number {
  if (!salary) return 0
  if (salary.base_transfer_amount != null) return amount(salary.base_transfer_amount)
  // 退路：與後端 services/salary/amounts.py::base_transfer_amount 同式
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
