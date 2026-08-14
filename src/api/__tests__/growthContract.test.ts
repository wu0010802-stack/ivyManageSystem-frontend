import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '@/api'
import {
  listGrowthHours,
  createGrowthHour,
  patchGrowthHour,
  deleteGrowthHour,
  patchSignedOn,
  getGrowthPreview,
} from '../growthContract'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

describe('growthContract API wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listGrowthHours → GET /growth-contract/hours 帶 school_year 必填 + employee_id 選填', async () => {
    // 真實契約 GrowthHourListOut：{ items: GrowthHourOut[] }
    const mockResp = {
      data: {
        items: [
          {
            id: 1,
            employee_id: 5,
            employee_name: '林慧慈',
            school_year: 115,
            semester: 1,
            activity_date: '2026-09-01',
            hours: 3.5,
            title: '幼兒發展研習',
            note: null,
            created_by: 1,
            created_at: '2026-08-14T00:00:00',
            updated_at: '2026-08-14T00:00:00',
          },
        ],
      },
    }
    asMock(api.get).mockResolvedValue(mockResp)

    const res = await listGrowthHours({ school_year: 115 })

    expect(api.get).toHaveBeenCalledWith('/growth-contract/hours', { params: { school_year: 115 } })
    expect(res).toBe(mockResp)
  })

  it('listGrowthHours 帶 employee_id 選填', async () => {
    asMock(api.get).mockResolvedValue({ data: { items: [] } })

    await listGrowthHours({ school_year: 115, employee_id: 5 })

    expect(api.get).toHaveBeenCalledWith('/growth-contract/hours', {
      params: { school_year: 115, employee_id: 5 },
    })
  })

  it('createGrowthHour → POST /growth-contract/hours 帶 body', async () => {
    // 真實契約 GrowthHourOut
    const mockResp = {
      data: {
        id: 2,
        employee_id: 5,
        employee_name: '林慧慈',
        school_year: 115,
        semester: 1,
        activity_date: '2026-09-05',
        hours: 2,
        title: '教保知能研習',
        note: null,
        created_by: 1,
        created_at: '2026-08-14T00:00:00',
        updated_at: '2026-08-14T00:00:00',
      },
    }
    asMock(api.post).mockResolvedValue(mockResp)

    const body = {
      employee_id: 5,
      school_year: 115,
      semester: 1,
      activity_date: '2026-09-05',
      hours: 2,
      title: '教保知能研習',
    }
    const res = await createGrowthHour(body)

    expect(api.post).toHaveBeenCalledWith('/growth-contract/hours', body)
    expect(res).toBe(mockResp)
  })

  it('patchGrowthHour → PATCH /growth-contract/hours/:id 帶 body', async () => {
    const mockResp = { data: { id: 2, hours: 3 } }
    asMock(api.patch).mockResolvedValue(mockResp)

    const body = { hours: 3 }
    const res = await patchGrowthHour(2, body)

    expect(api.patch).toHaveBeenCalledWith('/growth-contract/hours/2', body)
    expect(res).toBe(mockResp)
  })

  it('deleteGrowthHour → DELETE /growth-contract/hours/:id', async () => {
    // 真實契約 DeleteResultOut
    const mockResp = { data: { message: '已刪除' } }
    asMock(api.delete).mockResolvedValue(mockResp)

    const res = await deleteGrowthHour(2)

    expect(api.delete).toHaveBeenCalledWith('/growth-contract/hours/2')
    expect(res).toBe(mockResp)
  })

  it('patchSignedOn 傳 {} 時送出的 JSON body 不含 signed_on key（後端視為「未異動」）', async () => {
    // 真實契約 SignedOnOut
    const mockResp = { data: { employee_id: 5, growth_contract_signed_on: '2026-01-01' } }
    asMock(api.patch).mockResolvedValue(mockResp)

    await patchSignedOn(5, {})

    expect(api.patch).toHaveBeenCalledWith('/growth-contract/employees/5/signed-on', {})
    const sentBody = asMock(api.patch).mock.calls[0][1]
    expect(JSON.stringify(sentBody)).toBe('{}')
    expect('signed_on' in sentBody).toBe(false)
  })

  it('patchSignedOn 傳 {signed_on: null} 時送出的 JSON body 顯式含 null（後端視為「清空簽約日」）', async () => {
    const mockResp = { data: { employee_id: 5, growth_contract_signed_on: null } }
    asMock(api.patch).mockResolvedValue(mockResp)

    await patchSignedOn(5, { signed_on: null })

    expect(api.patch).toHaveBeenCalledWith('/growth-contract/employees/5/signed-on', { signed_on: null })
    const sentBody = asMock(api.patch).mock.calls[0][1]
    expect(JSON.stringify(sentBody)).toBe('{"signed_on":null}')
    expect('signed_on' in sentBody).toBe(true)
  })

  it('patchSignedOn 傳 {signed_on: "2026-01-01"} 時正常帶日期字串', async () => {
    const mockResp = { data: { employee_id: 5, growth_contract_signed_on: '2026-01-01' } }
    asMock(api.patch).mockResolvedValue(mockResp)

    await patchSignedOn(5, { signed_on: '2026-01-01' })

    expect(api.patch).toHaveBeenCalledWith('/growth-contract/employees/5/signed-on', {
      signed_on: '2026-01-01',
    })
  })

  it('getGrowthPreview → GET /growth-contract/preview 帶 school_year query', async () => {
    // 真實契約 GrowthPreviewOut
    const mockResp = {
      data: {
        school_year: 115,
        pending_rule: '金額語意待業主確認（P2）',
        rows: [
          {
            employee_id: 5,
            employee_name: '林慧慈',
            position_key: 'teacher',
            position_unknown: false,
            monthly_rate: 1000,
            actual_hours: 8,
            hours_ratio: 0.8,
            eligible: false,
            amount: 0,
            amount_if_eligible: 800,
            gates: [{ code: 'signed_contract', status: 'fail', detail: '未簽約' }],
          },
        ],
      },
    }
    asMock(api.get).mockResolvedValue(mockResp)

    const res = await getGrowthPreview(115)

    expect(api.get).toHaveBeenCalledWith('/growth-contract/preview', { params: { school_year: 115 } })
    expect(res).toBe(mockResp)
  })
})
