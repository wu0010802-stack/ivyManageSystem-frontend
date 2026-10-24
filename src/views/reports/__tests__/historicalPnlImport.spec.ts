import { describe, expect, it } from 'vitest'
import type { HistoricalPnlImport } from '@/api/historicalPnl'
import { parseHistoricalPnlImport } from '../historicalPnlImport'

function payload(): HistoricalPnlImport {
  return {
    year: 2026, source_name: '合成測試.xlsx', source_sha256: 'a'.repeat(64), basis_note: '合成測試，現金實付未核對',
    months: [{ month: 1, revenue: '100.00', expense: '60.00', profit: '40.00', rows: [
      { key: 'income', label: '收入', section: 'income', role: 'total', parent_key: null, amount: '100.00', source_cell: '測試!B1', direct_flags: [] },
      { key: 'expense', label: '支出', section: 'expense', role: 'total', parent_key: null, amount: '60.00', source_cell: '測試!B2', direct_flags: ['estimate'] },
      { key: 'profit', label: '損益', section: 'profit', role: 'total', parent_key: null, amount: '40.00', source_cell: '測試!B3', direct_flags: [] },
    ] }],
  }
}

describe('歷史損益 JSON 的讀取邊界', () => {
  it('保留 Decimal 字串、空白與零，讓後端驗證科目樹與等式', () => {
    const input = payload()
    input.months[0].rows.push({ key: 'blank', label: '空白科目', section: 'expense', role: 'detail', parent_key: 'expense', amount: null, source_cell: '測試!B4', direct_flags: [] })
    input.months[0].rows.push({ key: 'zero', label: '零額科目', section: 'expense', role: 'detail', parent_key: 'expense', amount: '0.00', source_cell: '測試!B5', direct_flags: [] })
    const parsed = parseHistoricalPnlImport(JSON.stringify(input), 2026)
    expect(parsed.months[0].rows[3].amount).toBeNull()
    expect(parsed.months[0].rows[4].amount).toBe('0.00')
  })

  it.each([
    ['非法 JSON', '{'],
    ['陣列', '[]'],
    ['多餘租戶欄位', JSON.stringify({ ...payload(), tenant_id: 9 })],
    ['本機來源路徑', JSON.stringify({ ...payload(), source_name: '/private/來源.xlsx' })],
    ['另一年度', JSON.stringify({ ...payload(), year: 2025 })],
    ['重複月份', JSON.stringify({ ...payload(), months: [payload().months[0], payload().months[0]] })],
    ['缺少科目', JSON.stringify({ ...payload(), months: [{ ...payload().months[0], rows: [] }] })],
    ['錯誤旗標', JSON.stringify({ ...payload(), months: [{ ...payload().months[0], rows: payload().months[0].rows.map(row => ({ ...row, direct_flags: ['confirmed'] })) }] })],
    ['未知列欄位', JSON.stringify({ ...payload(), months: [{ ...payload().months[0], rows: payload().months[0].rows.map(row => ({ ...row, formula: '=A1' })) }] })],
  ])('%s 在預覽前拒絕，錯誤不包含檔案內容', (_name, input) => {
    expect(() => parseHistoricalPnlImport(input, 2026)).toThrow('請選擇本年度整理後的損益 JSON，並確認檔案格式。')
  })
})
