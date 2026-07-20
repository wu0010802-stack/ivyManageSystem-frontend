import { describe, it, expect } from 'vitest'
import { formatBatchFailures } from '../settlementReject'

describe('formatBatchFailures', () => {
  const rows = [
    { id: 1, employee_name: '王小明' },
    { id: 2, employee_name: '李美華' },
  ]
  it('把 settlement_id 映射成姓名並帶原因', () => {
    const out = formatBatchFailures(
      [{ settlement_id: 2, reason: '會計簽核人需與主管簽核人為不同人（職責分離）' }],
      rows,
    )
    expect(out).toEqual(['李美華：會計簽核人需與主管簽核人為不同人（職責分離）'])
  })
  it('rows 找不到時退回顯示編號', () => {
    const out = formatBatchFailures([{ settlement_id: 99, reason: '找不到結算單' }], rows)
    expect(out).toEqual(['結算單 #99：找不到結算單'])
  })
})
