/**
 * getAllEmployees：員工清單不可靜默截斷（FE-F4）。
 *
 * 後端 GET /employees 單頁上限 500、預設 100，並以 `X-Total-Count` header 回報過濾後
 * 總數（body 仍是陣列）。需要完整名冊的地方（員工 store、離職發起、員工搜尋）改用
 * getAllEmployees：依 header 翻頁取完；header 缺席（舊後端）時退回單頁；翻頁上限
 * 仍取不完時提示使用者，而不是默默少人。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockWarning } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockWarning: vi.fn(),
}))

vi.mock('@/api/index', () => ({ default: { get: mockGet } }))
vi.mock('element-plus', () => ({ ElMessage: { warning: mockWarning } }))

import { getAllEmployees, EMPLOYEE_PAGE_LIMIT } from '@/api/employees'

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, name: `員工${from + i}` }))

describe('getAllEmployees', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockWarning.mockReset()
  })

  it('依 X-Total-Count 翻頁取完並合併成單一陣列', async () => {
    mockGet
      .mockResolvedValueOnce({ data: rows(1, EMPLOYEE_PAGE_LIMIT), headers: { 'x-total-count': '620' } })
      .mockResolvedValueOnce({ data: rows(501, 120), headers: { 'x-total-count': '620' } })

    const res = await getAllEmployees({ is_active: true })

    expect(res.data).toHaveLength(620)
    expect(mockGet).toHaveBeenNthCalledWith(1, '/employees', {
      params: { is_active: true, skip: 0, limit: EMPLOYEE_PAGE_LIMIT },
    })
    expect(mockGet).toHaveBeenNthCalledWith(2, '/employees', {
      params: { is_active: true, skip: EMPLOYEE_PAGE_LIMIT, limit: EMPLOYEE_PAGE_LIMIT },
    })
    expect(mockWarning).not.toHaveBeenCalled()
  })

  it('一頁就取完時只打一次', async () => {
    mockGet.mockResolvedValueOnce({ data: rows(1, 3), headers: { 'x-total-count': '3' } })
    const res = await getAllEmployees()
    expect(res.data).toHaveLength(3)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('沒有 X-Total-Count（舊後端）時退回單頁、不提示', async () => {
    mockGet.mockResolvedValueOnce({ data: rows(1, 3), headers: {} })
    const res = await getAllEmployees()
    expect(res.data).toHaveLength(3)
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockWarning).not.toHaveBeenCalled()
  })

  it('後端提前回空頁仍不足 total 時提示截斷', async () => {
    mockGet
      .mockResolvedValueOnce({ data: rows(1, EMPLOYEE_PAGE_LIMIT), headers: { 'x-total-count': '700' } })
      .mockResolvedValueOnce({ data: [], headers: { 'x-total-count': '700' } })
    const res = await getAllEmployees()
    expect(res.data).toHaveLength(EMPLOYEE_PAGE_LIMIT)
    expect(mockWarning).toHaveBeenCalledTimes(1)
    expect(String(mockWarning.mock.calls[0][0])).toContain('700')
  })
})
