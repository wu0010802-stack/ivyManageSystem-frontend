import { describe, it, expect, vi, beforeEach } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/index', () => ({ default: http }))

import { getAppraisalSheetCandidates, getAppraisalSheetsPdf } from '@/api/attendance'

beforeEach(() => {
  http.get.mockReset().mockResolvedValue({ data: {} })
})

describe('月考核表 API wrapper', () => {
  it('getAppraisalSheetCandidates：GET 候選名單，年月走 params', async () => {
    await getAppraisalSheetCandidates({ year: 2026, month: 9 })
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.get).toHaveBeenCalledWith('/attendance/appraisal-sheets/candidates', {
      params: { year: 2026, month: 9 },
    })
  })

  it('getAppraisalSheetsPdf：blob 下載，employee_ids 以重複 key 序列化（indexes: null）', async () => {
    await getAppraisalSheetsPdf({ year: 2026, month: 9, employee_ids: [3, 5] })
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.get).toHaveBeenCalledWith('/attendance/appraisal-sheets.pdf', {
      params: { year: 2026, month: 9, employee_ids: [3, 5] },
      responseType: 'blob',
      paramsSerializer: { indexes: null },
    })
  })
})
