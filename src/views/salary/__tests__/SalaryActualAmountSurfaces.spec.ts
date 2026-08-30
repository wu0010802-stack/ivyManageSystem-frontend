import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const snapshotSource = readFileSync(
  resolve(process.cwd(), 'src/views/salary/SalarySnapshotDialog.vue'),
  'utf8',
)
const simulateSource = readFileSync(
  resolve(process.cwd(), 'src/views/salary/SalarySimulatePanel.vue'),
  'utf8',
)
const breakdownSource = readFileSync(
  resolve(process.cwd(), 'src/views/salary/SalaryBreakdown.vue'),
  'utf8',
)
const portalSource = readFileSync(
  resolve(process.cwd(), 'src/views/portal/PortalSalaryView.vue'),
  'utf8',
)

describe('薪資實領口徑跨畫面一致', () => {
  it('snapshot 與 portal 都以同一「主薪轉金額」口徑顯示', () => {
    expect(snapshotSource).toContain('computeBaseTransferAmount(row)')
    // portal 自 2026-08-24 起吃後端 build_history_breakdown 契約，直接顯示後端算好的
    // base_transfer_amount（services/salary/amounts.py::base_transfer_amount
    // = net_salary + unused_leave_payout，與前端 computeBaseTransferAmount 同式；
    // 該 docstring 明訂銀行名冊／薪資單／員工查詢畫面一律走此 helper）。
    // 口徑一致性因此由後端單一來源保證，比前端各自重算更強——但仍鎖住 portal
    // 顯示的是主薪轉金額而非 net_salary，避免把獨立轉帳混進「實發」。
    expect(portalSource).toContain('salary.base_transfer_amount')
  })

  it('純 simulate 不再宣稱是包含未休折現的最終到手', () => {
    expect(simulateSource).toContain('不含未休折現')
    expect(simulateSource).not.toContain('員工最終到手')
    expect(breakdownSource).toContain('試算淨薪')
    expect(breakdownSource).not.toContain('實領 {{ money(preview.net_pay) }}')
  })
})
