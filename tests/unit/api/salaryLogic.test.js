/**
 * tests/unit/api/salaryLogic.test.js
 *
 * 薪資邏輯與員工薪資 debug 端點 wrapper 的契約測試。
 * 過去這兩個 wrapper 在 src/api/dev.js 打 /dev/salary-logic、/dev/employee-salary-debug，
 * 在 ENV 不在白名單的環境下後端不掛 dev_router → 前端 404。修復後改打正式
 * /salaries/* 路徑，本檔釘住 wrapper 的目標路徑避免回歸。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { getSalaryLogic, getEmployeeSalaryDebug } from '@/api/salary'

describe('salary api — 薪資邏輯 / debug wrapper 路徑契約', () => {
  beforeEach(() => {
    mockGet.mockClear()
  })

  it('getSalaryLogic 打 /salaries/logic（不可再走 /dev/*）', async () => {
    await getSalaryLogic()
    expect(mockGet).toHaveBeenCalledWith('/salaries/logic')
    expect(mockGet).not.toHaveBeenCalledWith(expect.stringContaining('/dev/'))
  })

  it('getEmployeeSalaryDebug 透過 params 傳 employee_id/year/month，路徑為正式 /salaries/employee-salary-debug', async () => {
    await getEmployeeSalaryDebug({ employee_id: 7, year: 2026, month: 4 })
    expect(mockGet).toHaveBeenCalledWith(
      '/salaries/employee-salary-debug',
      { params: { employee_id: 7, year: 2026, month: 4 } }
    )
    const [calledPath] = mockGet.mock.calls[0]
    expect(calledPath).not.toContain('/dev/')
  })
})
