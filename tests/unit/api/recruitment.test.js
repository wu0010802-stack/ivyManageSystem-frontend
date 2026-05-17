/**
 * tests/unit/api/recruitment.test.js
 *
 * 驗證 src/api/recruitment.js wrapper：HTTP method / URL / payload / params / blob。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}))

import * as mod from '@/api/recruitment'

describe('recruitment api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('getRecruitmentRecords GET /recruitment/records with params', async () => {
    await mod.getRecruitmentRecords({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/records', { params: { status: 'pending' } })
  })

  it('createRecruitmentRecord POST /recruitment/records', async () => {
    const payload = { child_name: 'A' }
    await mod.createRecruitmentRecord(payload)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/records', payload)
  })

  it('updateRecruitmentRecord PUT /recruitment/records/:id', async () => {
    const payload = { child_name: 'B' }
    await mod.updateRecruitmentRecord(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/recruitment/records/42', payload)
  })

  it('deleteRecruitmentRecord DELETE /recruitment/records/:id', async () => {
    await mod.deleteRecruitmentRecord(42)
    expect(mockDelete).toHaveBeenCalledWith('/recruitment/records/42')
  })

  it('convertRecruitmentRecord POST /recruitment/records/:id/convert', async () => {
    const payload = { student_id_code: 'S001', classroom_id: 7 }
    await mod.convertRecruitmentRecord(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/records/42/convert', payload)
  })

  it('getRecruitmentStats GET /recruitment/stats with params', async () => {
    await mod.getRecruitmentStats({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/stats', { params: { year: 2026 } })
  })

  it('getRecruitmentOptions GET /recruitment/options with params', async () => {
    await mod.getRecruitmentOptions({ scope: 'all' })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/options', { params: { scope: 'all' } })
  })

  it('importRecruitmentRecords POST /recruitment/import with records body', async () => {
    const records = [{ child_name: 'A' }, { child_name: 'B' }]
    await mod.importRecruitmentRecords(records)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/import', records)
  })

  it('getNoDepositAnalysis GET /recruitment/no-deposit-analysis with params', async () => {
    await mod.getNoDepositAnalysis({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/no-deposit-analysis', { params: { year: 2026 } })
  })

  it('getRecruitmentAddressHotspots GET /recruitment/address-hotspots with params', async () => {
    await mod.getRecruitmentAddressHotspots({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/address-hotspots', { params: { year: 2026 } })
  })

  it('syncRecruitmentAddressHotspots POST /recruitment/address-hotspots/sync with null body + params', async () => {
    await mod.syncRecruitmentAddressHotspots({ year: 2026 })
    expect(mockPost).toHaveBeenCalledWith('/recruitment/address-hotspots/sync', null, {
      params: { year: 2026 },
    })
  })

  it('getRecruitmentCampusSetting GET /recruitment/campus-setting', async () => {
    await mod.getRecruitmentCampusSetting()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/campus-setting')
  })

  it('updateRecruitmentCampusSetting PUT /recruitment/campus-setting', async () => {
    const payload = { lat: 25, lng: 121 }
    await mod.updateRecruitmentCampusSetting(payload)
    expect(mockPut).toHaveBeenCalledWith('/recruitment/campus-setting', payload)
  })

  it('getRecruitmentNearbyKindergartens GET /recruitment/nearby-kindergartens', async () => {
    await mod.getRecruitmentNearbyKindergartens()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/nearby-kindergartens')
  })

  it('getRecruitmentMarketIntelligence GET /recruitment/market-intelligence with params', async () => {
    await mod.getRecruitmentMarketIntelligence({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/market-intelligence', { params: { year: 2026 } })
  })

  it('syncRecruitmentMarketIntelligence POST /recruitment/market-intelligence/sync with null body + params', async () => {
    await mod.syncRecruitmentMarketIntelligence({ year: 2026 })
    expect(mockPost).toHaveBeenCalledWith('/recruitment/market-intelligence/sync', null, {
      params: { year: 2026 },
    })
  })

  it('getPeriods GET /recruitment/periods', async () => {
    await mod.getPeriods()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/periods')
  })

  it('getPeriodsSummary GET /recruitment/periods/summary with params', async () => {
    await mod.getPeriodsSummary({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/periods/summary', { params: { year: 2026 } })
  })

  it('createPeriod POST /recruitment/periods', async () => {
    const payload = { name: '114 上' }
    await mod.createPeriod(payload)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/periods', payload)
  })

  it('updatePeriod PUT /recruitment/periods/:id', async () => {
    const payload = { name: 'X' }
    await mod.updatePeriod(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/recruitment/periods/42', payload)
  })

  it('deletePeriod DELETE /recruitment/periods/:id', async () => {
    await mod.deletePeriod(42)
    expect(mockDelete).toHaveBeenCalledWith('/recruitment/periods/42')
  })

  it('syncPeriod POST /recruitment/periods/:id/sync', async () => {
    await mod.syncPeriod(42)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/periods/42/sync')
  })

  it('exportRecruitmentStats GET /recruitment/stats/export with blob + params', async () => {
    await mod.exportRecruitmentStats({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/stats/export', {
      params: { year: 2026 },
      responseType: 'blob',
    })
  })

  it('getMonths GET /recruitment/months', async () => {
    await mod.getMonths()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/months')
  })

  it('addMonth POST /recruitment/months with body { month }', async () => {
    await mod.addMonth('2026-05')
    expect(mockPost).toHaveBeenCalledWith('/recruitment/months', { month: '2026-05' })
  })

  it('deleteMonth DELETE /recruitment/months/:month encoded', async () => {
    await mod.deleteMonth('2026-05')
    expect(mockDelete).toHaveBeenCalledWith(`/recruitment/months/${encodeURIComponent('2026-05')}`)
  })

  it('getGeocodePendingCount GET /recruitment/competitor-schools/geocode-pending', async () => {
    await mod.getGeocodePendingCount()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/competitor-schools/geocode-pending')
  })

  it('geocodeCompetitorSchools POST /recruitment/competitor-schools/geocode with default limit', async () => {
    await mod.geocodeCompetitorSchools()
    expect(mockPost).toHaveBeenCalledWith('/recruitment/competitor-schools/geocode', null, {
      params: { limit: 826 },
    })
  })

  it('geocodeCompetitorSchools POST with custom limit', async () => {
    await mod.geocodeCompetitorSchools(100)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/competitor-schools/geocode', null, {
      params: { limit: 100 },
    })
  })

  it('syncKiangData POST /recruitment/competitor-schools/sync-kiang', async () => {
    await mod.syncKiangData()
    expect(mockPost).toHaveBeenCalledWith('/recruitment/competitor-schools/sync-kiang')
  })

  it('getCampusCompetition GET /recruitment/campus-competition', async () => {
    await mod.getCampusCompetition()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/campus-competition')
  })

  it('getGovKindergartens GET /recruitment/gov-kindergartens with params', async () => {
    await mod.getGovKindergartens({ city: '高雄' })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/gov-kindergartens', { params: { city: '高雄' } })
  })

  it('syncGovKindergartens POST /recruitment/gov-kindergartens/sync default background=true', async () => {
    await mod.syncGovKindergartens()
    expect(mockPost).toHaveBeenCalledWith('/recruitment/gov-kindergartens/sync', null, {
      params: { background: true },
    })
  })

  it('syncGovKindergartens POST with background=false', async () => {
    await mod.syncGovKindergartens(false)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/gov-kindergartens/sync', null, {
      params: { background: false },
    })
  })

  it('getGovKindergartensSyncStatus GET /recruitment/gov-kindergartens/sync-status', async () => {
    await mod.getGovKindergartensSyncStatus()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/gov-kindergartens/sync-status')
  })
})
