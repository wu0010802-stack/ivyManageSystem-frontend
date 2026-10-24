import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoricalPnlImport } from '../historicalPnl'

vi.mock('@/api/index', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '@/api/index'
import { getHistoricalPnl, importHistoricalPnl, previewHistoricalPnl } from '../historicalPnl'

beforeEach(() => { vi.clearAllMocks() })

describe('歷史損益 API 契約', () => {
  it('以年度查詢專用端點，不替換現金報表 API', () => {
    getHistoricalPnl(2026)
    expect(api.get).toHaveBeenCalledWith('/reports/historical-pnl', { params: { year: 2026 } })
  })

  it('預覽與匯入分開送出原樣 payload，不增加租戶欄位', () => {
    const payload: HistoricalPnlImport = { year: 2026, source_name: '合成測試.xlsx', source_sha256: 'a'.repeat(64), basis_note: '合成測試', months: [] }
    previewHistoricalPnl(payload)
    expect(api.post).toHaveBeenCalledWith('/reports/historical-pnl/preview', payload)
    importHistoricalPnl(payload)
    expect(api.post).toHaveBeenCalledWith('/reports/historical-pnl/import', payload)
  })
})
