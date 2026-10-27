import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import api from '@/api/index'
import { markAppraisalCycleRosterPaid, unmarkAppraisalCycleRosterPaid } from '../appraisal'

describe('考核名冊已發放標記 API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('標記：POST /appraisal/cycles/{id}/roster-paid，備註去頭尾空白後送出', () => {
    markAppraisalCycleRosterPaid(7, '  115/02 名冊轉帳  ')
    expect(api.post).toHaveBeenCalledWith('/appraisal/cycles/7/roster-paid', { note: '115/02 名冊轉帳' })
  })

  it('標記：沒有備註或只有空白時 body 不帶 note（後端 note 選填）', () => {
    markAppraisalCycleRosterPaid(7)
    expect(api.post).toHaveBeenLastCalledWith('/appraisal/cycles/7/roster-paid', {})
    markAppraisalCycleRosterPaid(7, '   ')
    expect(api.post).toHaveBeenLastCalledWith('/appraisal/cycles/7/roster-paid', {})
  })

  it('取消：DELETE /appraisal/cycles/{id}/roster-paid', () => {
    unmarkAppraisalCycleRosterPaid(7)
    expect(api.delete).toHaveBeenCalledWith('/appraisal/cycles/7/roster-paid')
  })
})
