import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import api from '@/api/index'
import {
  createFestivalSuspension,
  deleteFestivalSuspension,
  getFestivalSuspensionDecision,
  listFestivalSuspensions,
  updateFestivalSuspension,
} from '../salary'

describe('節慶停課月登記 API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('列表：GET /salaries/festival-suspensions，年月走 query', () => {
    listFestivalSuspensions({ year: 2026, month: 9 })
    expect(api.get).toHaveBeenCalledWith('/salaries/festival-suspensions', { params: { year: 2026, month: 9 } })
  })

  it('判定預覽：GET /salaries/festival-suspensions/decision', () => {
    getFestivalSuspensionDecision({ year: 2026, month: 9 })
    expect(api.get).toHaveBeenCalledWith('/salaries/festival-suspensions/decision', {
      params: { year: 2026, month: 9 },
    })
  })

  it('新增：POST，全園不帶 classroom_id', () => {
    createFestivalSuspension({ year: 2026, month: 9, suspended_days: 12, reason: '颱風' })
    expect(api.post).toHaveBeenCalledWith('/salaries/festival-suspensions', {
      year: 2026,
      month: 9,
      suspended_days: 12,
      reason: '颱風',
    })
  })

  it('更新：PUT /salaries/festival-suspensions/{id}', () => {
    updateFestivalSuspension(5, { suspended_days: 3, reason: null })
    expect(api.put).toHaveBeenCalledWith('/salaries/festival-suspensions/5', { suspended_days: 3, reason: null })
  })

  it('刪除：DELETE /salaries/festival-suspensions/{id}，不需原因時不帶 query', () => {
    deleteFestivalSuspension(5)
    expect(api.delete).toHaveBeenCalledWith('/salaries/festival-suspensions/5')
    deleteFestivalSuspension(5, '   ')
    expect(api.delete).toHaveBeenLastCalledWith('/salaries/festival-suspensions/5')
  })

  it('刪除全園或 >=10 日的登記：原因去頭尾空白後走 query reason', () => {
    deleteFestivalSuspension(5, '  颱風停課取消，改為正常上課  ')
    expect(api.delete).toHaveBeenCalledWith('/salaries/festival-suspensions/5', {
      params: { reason: '颱風停課取消，改為正常上課' },
    })
  })
})
