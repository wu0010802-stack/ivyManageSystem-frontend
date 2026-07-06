/**
 * tests/unit/api/appraisal.test.js
 *
 * 驗證 src/api/appraisal.ts 各 wrapper 的 HTTP method / URL / payload 形狀。
 * 不驗業務邏輯，只驗薄殼有把參數正確轉發到 api client。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockPatch: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    patch: mockPatch,
    defaults: { baseURL: '/api' },
  },
}))

import * as mod from '@/api/appraisal'

describe('appraisal api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
    mockPatch.mockResolvedValue({ data: {} })
  })

  it('listAppraisalCycles GET /appraisal/cycles', async () => {
    await mod.listAppraisalCycles()
    expect(mockGet).toHaveBeenCalledWith('/appraisal/cycles')
  })

  it('createAppraisalCycle POST /appraisal/cycles', async () => {
    const payload = { name: '114-1', start_date: '2025-09-01', end_date: '2026-01-31' }
    await mod.createAppraisalCycle(payload)
    expect(mockPost).toHaveBeenCalledWith('/appraisal/cycles', payload)
  })

  it('patchAppraisalCycle PATCH /appraisal/cycles/:id', async () => {
    await mod.patchAppraisalCycle(42, { name: 'updated' })
    expect(mockPatch).toHaveBeenCalledWith('/appraisal/cycles/42', { name: 'updated' })
  })

  it('listAppraisalCatalog GET /appraisal/catalog', async () => {
    await mod.listAppraisalCatalog()
    expect(mockGet).toHaveBeenCalledWith('/appraisal/catalog')
  })

  it('listAppraisalParticipants GET /appraisal/cycles/:id/participants', async () => {
    await mod.listAppraisalParticipants(7)
    expect(mockGet).toHaveBeenCalledWith('/appraisal/cycles/7/participants')
  })

  it('addAppraisalParticipant POST /appraisal/cycles/:id/participants', async () => {
    const payload = { employee_id: 99 }
    await mod.addAppraisalParticipant(7, payload)
    expect(mockPost).toHaveBeenCalledWith('/appraisal/cycles/7/participants', payload)
  })

  it('listAppraisalScoreItems GET /appraisal/participants/:id/score_items', async () => {
    await mod.listAppraisalScoreItems(33)
    expect(mockGet).toHaveBeenCalledWith('/appraisal/participants/33/score_items')
  })

  it('addAppraisalScoreItem POST /appraisal/participants/:id/score_items', async () => {
    const payload = { catalog_code: 'A1', delta: 2 }
    await mod.addAppraisalScoreItem(33, payload)
    expect(mockPost).toHaveBeenCalledWith('/appraisal/participants/33/score_items', payload)
  })

  it('listAppraisalSummaries GET /appraisal/cycles/:id/summaries', async () => {
    await mod.listAppraisalSummaries(7)
    expect(mockGet).toHaveBeenCalledWith('/appraisal/cycles/7/summaries')
  })

  it('recomputeAppraisalSummaries POST /appraisal/cycles/:id/summaries:recompute', async () => {
    await mod.recomputeAppraisalSummaries(7)
    expect(mockPost).toHaveBeenCalledWith('/appraisal/cycles/7/summaries:recompute')
  })

  it('signSupervisorAppraisalSummary POST sign_supervisor with default empty comment', async () => {
    await mod.signSupervisorAppraisalSummary(11)
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/summaries/11/sign_supervisor',
      null,
      { params: { comment: '' } }
    )
  })

  it('signSupervisorAppraisalSummary POST sign_supervisor with comment', async () => {
    await mod.signSupervisorAppraisalSummary(11, '同意')
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/summaries/11/sign_supervisor',
      null,
      { params: { comment: '同意' } }
    )
  })

  it('signAccountingAppraisalSummary POST sign_accounting with comment', async () => {
    await mod.signAccountingAppraisalSummary(11, '核可')
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/summaries/11/sign_accounting',
      null,
      { params: { comment: '核可' } }
    )
  })

  it('finalizeAppraisalSummary POST finalize with comment', async () => {
    await mod.finalizeAppraisalSummary(11, '結案')
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/summaries/11/finalize',
      null,
      { params: { comment: '結案' } }
    )
  })

  it('listAppraisalBonusRates GET /appraisal/bonus_rates', async () => {
    await mod.listAppraisalBonusRates()
    expect(mockGet).toHaveBeenCalledWith('/appraisal/bonus_rates')
  })

  it('createAppraisalBonusRate POST /appraisal/bonus_rates', async () => {
    const payload = { min_score: 90, rate: 1.2 }
    await mod.createAppraisalBonusRate(payload)
    expect(mockPost).toHaveBeenCalledWith('/appraisal/bonus_rates', payload)
  })

  it('importAppraisalExcel POST multipart with file + date params', async () => {
    const fakeFile = new Blob(['x'], { type: 'application/octet-stream' })
    await mod.importAppraisalExcel(fakeFile, {
      startDate: '2025-09-01',
      endDate: '2026-01-31',
      baseScoreCalcDate: '2025-09-15',
    })
    expect(mockPost).toHaveBeenCalledTimes(1)
    const [url, fd, opts] = mockPost.mock.calls[0]
    expect(url).toBe('/appraisal/cycles/import_excel')
    expect(fd).toBeInstanceOf(FormData)
    // happy-dom 在 FormData.append 時會把 Blob 包成 File；驗 type 即可
    const fileEntry = fd.get('file')
    expect(fileEntry).toBeTruthy()
    expect(fileEntry.type).toBe('application/octet-stream')
    expect(opts).toEqual({
      params: {
        start_date: '2025-09-01',
        end_date: '2026-01-31',
        base_score_calc_date: '2025-09-15',
      },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('exportAppraisalCycleXlsxUrl returns absolute export path', () => {
    expect(mod.exportAppraisalCycleXlsxUrl(7)).toBe('/api/appraisal/cycles/7/export.xlsx')
  })

  it('exportAppraisalTransferRosterXlsxUrl returns absolute transfer roster path', () => {
    expect(mod.exportAppraisalTransferRosterXlsxUrl(7)).toBe(
      '/api/appraisal/cycles/7/transfer_roster.xlsx'
    )
  })

  it('getAppraisalCurrentCycle GET /appraisal/current with empty params by default', async () => {
    await mod.getAppraisalCurrentCycle()
    expect(mockGet).toHaveBeenCalledWith('/appraisal/current', { params: {} })
  })

  it('getAppraisalCurrentCycle GET /appraisal/current with custom params', async () => {
    await mod.getAppraisalCurrentCycle({ academic_year: 114 })
    expect(mockGet).toHaveBeenCalledWith('/appraisal/current', {
      params: { academic_year: 114 },
    })
  })

  it('getAppraisalCyclesByYear GET /appraisal/by_year/:year', async () => {
    await mod.getAppraisalCyclesByYear(114)
    expect(mockGet).toHaveBeenCalledWith('/appraisal/by_year/114')
  })

  it('getAppraisalAggregatedStatus GET /appraisal/cycles/:id/aggregated_status', async () => {
    await mod.getAppraisalAggregatedStatus(7)
    expect(mockGet).toHaveBeenCalledWith('/appraisal/cycles/7/aggregated_status')
  })

  it('syncAppraisalScoreItems POST sync_score_items with default dry_run=false', async () => {
    await mod.syncAppraisalScoreItems(7)
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/cycles/7/sync_score_items',
      null,
      { params: { dry_run: false } }
    )
  })

  it('syncAppraisalScoreItems POST sync_score_items with dryRun=true', async () => {
    await mod.syncAppraisalScoreItems(7, { dryRun: true })
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/cycles/7/sync_score_items',
      null,
      { params: { dry_run: true } }
    )
  })

  it('getAppraisalAllEmployeesStatus GET /appraisal/cycles/:id/all_employees_status', async () => {
    await mod.getAppraisalAllEmployeesStatus(7)
    expect(mockGet).toHaveBeenCalledWith('/appraisal/cycles/7/all_employees_status')
  })

  it('bulkAddAppraisalParticipantsFromActive POST with null employee_ids by default', async () => {
    await mod.bulkAddAppraisalParticipantsFromActive(7)
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/cycles/7/participants:bulk_from_active',
      { employee_ids: null }
    )
  })

  it('bulkAddAppraisalParticipantsFromActive POST with explicit ids', async () => {
    await mod.bulkAddAppraisalParticipantsFromActive(7, [1, 2, 3])
    expect(mockPost).toHaveBeenCalledWith(
      '/appraisal/cycles/7/participants:bulk_from_active',
      { employee_ids: [1, 2, 3] }
    )
  })

  it('patchAppraisalCatalogItem PATCH /appraisal/catalog/:item_id with payload', async () => {
    const payload = { label: '新標籤', is_active: false }
    await mod.patchAppraisalCatalogItem(9, payload)
    expect(mockPatch).toHaveBeenCalledWith('/appraisal/catalog/9', payload)
  })
})
