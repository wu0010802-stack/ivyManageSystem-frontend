import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

import api from '@/api'
import {
  listCampaigns,
  createCampaign,
  getCampaign,
  patchCampaign,
  syncCandidates,
  createAttribution,
  patchAttribution,
  settleCampaign,
  getCampaignReport,
  getTransferRoster,
  exportCampaignXlsx,
} from '../recruitmentBonus'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

describe('recruitmentBonus API wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listCampaigns → GET /recruitment-bonus/campaigns，不 unwrap data', async () => {
    // 真實契約 CampaignListOut：{ items: CampaignOut[] }
    const mockResp = {
      data: {
        items: [
          {
            id: 1,
            name: '115上招生獎勵',
            start_date: '2026-03-16',
            end_date: '2026-09-15',
            status: 'open',
            tier_config: [{ min: 1, amount: 400 }],
            grade_multipliers: { 大班: 0.5 },
            point_catalog: { self_report: { label: '自報生', points: 0.3 } },
            collector_share: 100,
            pending_count: 2,
            confirmed_count: 5,
            settled_at: null,
            settled_by: null,
            created_at: '2026-08-14T00:00:00',
            updated_at: '2026-08-14T00:00:00',
          },
        ],
      },
    }
    asMock(api.get).mockResolvedValue(mockResp)

    const res = await listCampaigns()

    expect(api.get).toHaveBeenCalledWith('/recruitment-bonus/campaigns')
    // AxiosResp 慣例：wrapper 不 unwrap .data，呼叫端自己取
    expect(res).toBe(mockResp)
    expect(res.data.items[0].status).toBe('open')
  })

  it('createCampaign → POST /recruitment-bonus/campaigns 帶 body', async () => {
    // 真實契約 CampaignOut
    const mockResp = {
      data: {
        id: 2,
        name: '115下招生獎勵',
        start_date: '2026-09-16',
        end_date: '2027-03-15',
        status: 'open',
        tier_config: [{ min: 1, amount: 400 }],
        grade_multipliers: { 大班: 0.5 },
        point_catalog: { self_report: { label: '自報生', points: 0.3 } },
        collector_share: 100,
        pending_count: 0,
        confirmed_count: 0,
        settled_at: null,
        settled_by: null,
        created_at: '2026-08-14T00:00:00',
        updated_at: '2026-08-14T00:00:00',
      },
    }
    asMock(api.post).mockResolvedValue(mockResp)

    const body = { name: '115下招生獎勵', start_date: '2026-09-16', end_date: '2027-03-15' }
    const res = await createCampaign(body)

    expect(api.post).toHaveBeenCalledWith('/recruitment-bonus/campaigns', body)
    expect(res).toBe(mockResp)
  })

  it('getCampaign → GET /recruitment-bonus/campaigns/:id', async () => {
    // 真實契約 CampaignDetailOut：多了 attributions / employee_summary
    const mockResp = {
      data: {
        id: 1,
        name: '115上招生獎勵',
        start_date: '2026-03-16',
        end_date: '2026-09-15',
        status: 'open',
        tier_config: [{ min: 1, amount: 400 }],
        grade_multipliers: { 大班: 0.5 },
        point_catalog: { self_report: { label: '自報生', points: 0.3 } },
        collector_share: 100,
        pending_count: 0,
        confirmed_count: 1,
        settled_at: null,
        settled_by: null,
        created_at: '2026-08-14T00:00:00',
        updated_at: '2026-08-14T00:00:00',
        attributions: [],
        employee_summary: [],
      },
    }
    asMock(api.get).mockResolvedValue(mockResp)

    const res = await getCampaign(1)

    expect(api.get).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1')
    expect(res).toBe(mockResp)
  })

  it('patchCampaign → PATCH /recruitment-bonus/campaigns/:id 帶 body', async () => {
    const mockResp = { data: { id: 1, status: 'open' } }
    asMock(api.patch).mockResolvedValue(mockResp)

    const body = { name: '115上招生獎勵（修）' }
    const res = await patchCampaign(1, body)

    expect(api.patch).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1', body)
    expect(res).toBe(mockResp)
  })

  it('syncCandidates → POST /recruitment-bonus/campaigns/:id/sync-candidates 無 body', async () => {
    // 真實契約 RecruitmentBonusSyncResultOut
    const mockResp = {
      data: { created: 3, excluded: 0, skipped_other_campaign: 0, carried_over: 1, note: '同步完成' },
    }
    asMock(api.post).mockResolvedValue(mockResp)

    const res = await syncCandidates(1)

    expect(api.post).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1/sync-candidates')
    expect(res).toBe(mockResp)
  })

  it('createAttribution → POST .../attributions 帶 body', async () => {
    // 真實契約 AttributionOut
    const mockResp = {
      data: {
        id: 10,
        campaign_id: 1,
        recruitment_visit_id: null,
        employee_id: 5,
        employee_name: '林慧慈',
        point_code: 'self_report',
        points: 0.3,
        grade_multiplier: 1.5,
        collector_employee_id: null,
        collector_name: null,
        status: 'pending',
        notes: null,
        created_at: '2026-08-14T00:00:00',
        updated_at: '2026-08-14T00:00:00',
      },
    }
    asMock(api.post).mockResolvedValue(mockResp)

    const body = {
      employee_id: 5,
      point_code: 'self_report',
      points: 0.3,
      grade_multiplier: 1.5,
      status: 'pending',
    }
    const res = await createAttribution(1, body)

    expect(api.post).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1/attributions', body)
    expect(res).toBe(mockResp)
  })

  it('patchAttribution → PATCH .../attributions/:aid 帶 body', async () => {
    const mockResp = { data: { id: 10, status: 'confirmed' } }
    asMock(api.patch).mockResolvedValue(mockResp)

    const body = { status: 'confirmed' }
    const res = await patchAttribution(1, 10, body)

    expect(api.patch).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1/attributions/10', body)
    expect(res).toBe(mockResp)
  })

  it('settleCampaign → POST .../settle 無 body', async () => {
    // 真實契約 SettleResultOut
    const mockResp = {
      data: {
        campaign_id: 1,
        settled_at: '2026-08-14T00:00:00',
        payments: [{ employee_id: 5, employee_name: '林慧慈', amount: 600, resigned: false }],
      },
    }
    asMock(api.post).mockResolvedValue(mockResp)

    const res = await settleCampaign(1)

    expect(api.post).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1/settle')
    expect(res).toBe(mockResp)
  })

  it('getCampaignReport → GET .../report', async () => {
    // 真實契約 RecruitmentBonusReportOut
    const mockResp = {
      data: {
        campaign_id: 1,
        campaign_name: '115.03',
        status: 'open',
        blocks: [],
        unassigned_rows: [],
        total_amount: 0,
        settled_mismatches: [],
      },
    }
    asMock(api.get).mockResolvedValue(mockResp)

    const res = await getCampaignReport(1)

    expect(api.get).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1/report')
    expect(res).toBe(mockResp)
  })

  it('getTransferRoster → GET .../transfer-roster', async () => {
    // 真實契約 RecruitmentBonusRosterOut
    const mockResp = {
      data: {
        campaign_id: 1,
        campaign_name: '115.03',
        account_masked: false,
        rows: [
          {
            employee_id: 5,
            employee_name: '林慧慈',
            bank_code: '013',
            bank_account: '1234566436',
            bank_account_name: '林慧慈',
            amount: 960,
            missing_account: false,
          },
        ],
        total_amount: 960,
      },
    }
    asMock(api.get).mockResolvedValue(mockResp)

    const res = await getTransferRoster(1)

    expect(api.get).toHaveBeenCalledWith('/recruitment-bonus/campaigns/1/transfer-roster')
    expect(res).toBe(mockResp)
  })

  it('exportCampaignXlsx → GET .../export 帶 blob responseType', async () => {
    const mockResp = { data: new Blob() }
    asMock(api.get).mockResolvedValue(mockResp)

    await exportCampaignXlsx(2)

    expect(api.get).toHaveBeenCalledWith('/recruitment-bonus/campaigns/2/export', {
      responseType: 'blob',
    })
  })
})
