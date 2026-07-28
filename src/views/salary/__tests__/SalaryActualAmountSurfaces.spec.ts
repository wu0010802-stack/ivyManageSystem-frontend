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
  it('snapshot 與 portal 都透過共用 helper 顯示主薪轉金額', () => {
    expect(snapshotSource).toContain('computeBaseTransferAmount(row)')
    expect(portalSource).toContain('computeBaseTransferAmount(salary.value)')
  })

  it('純 simulate 不再宣稱是包含未休折現的最終到手', () => {
    expect(simulateSource).toContain('不含未休折現')
    expect(simulateSource).not.toContain('員工最終到手')
    expect(breakdownSource).toContain('試算淨薪')
    expect(breakdownSource).not.toContain('實領 {{ money(preview.net_pay) }}')
  })
})
