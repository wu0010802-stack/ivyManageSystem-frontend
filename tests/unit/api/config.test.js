/**
 * tests/unit/api/config.test.js
 *
 * 薄殼測試：驗證 src/api/config.ts 每個 exported function 的 method/URL/payload。
 * 涵蓋職稱、考勤規則、勞健保費率、獎金設定、班級目標、職位標準底薪。
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

import * as mod from '@/api/config'

describe('config api', () => {
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

  // ----- 職稱 -----
  it('getTitles GET /config/titles', async () => {
    await mod.getTitles()
    expect(mockGet).toHaveBeenCalledWith('/config/titles')
  })

  it('createTitle POST /config/titles with body', async () => {
    const payload = { name: '園長', bonus_grade: 'A' }
    await mod.createTitle(payload)
    expect(mockPost).toHaveBeenCalledWith('/config/titles', payload)
  })

  it('updateTitle PUT /config/titles/:id with body', async () => {
    const payload = { name: '副園長' }
    await mod.updateTitle(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/config/titles/42', payload)
  })

  it('deleteTitle DELETE /config/titles/:id', async () => {
    await mod.deleteTitle(42)
    expect(mockDelete).toHaveBeenCalledWith('/config/titles/42')
  })

  // ----- 考勤規則 -----
  it('getAttendancePolicy GET /config/attendance-policy', async () => {
    await mod.getAttendancePolicy()
    expect(mockGet).toHaveBeenCalledWith('/config/attendance-policy')
  })

  it('updateAttendancePolicy PUT /config/attendance-policy with body', async () => {
    const payload = { late_threshold_minutes: 5 }
    await mod.updateAttendancePolicy(payload)
    expect(mockPut).toHaveBeenCalledWith('/config/attendance-policy', payload)
  })

  // ----- 勞健保費率 -----
  it('getInsuranceRates GET /config/insurance-rates', async () => {
    await mod.getInsuranceRates()
    expect(mockGet).toHaveBeenCalledWith('/config/insurance-rates')
  })

  it('updateInsuranceRates PUT /config/insurance-rates with body', async () => {
    const payload = { labor_rate: 0.105 }
    await mod.updateInsuranceRates(payload)
    expect(mockPut).toHaveBeenCalledWith('/config/insurance-rates', payload)
  })

  // ----- 獎金設定 -----
  it('getBonusConfig GET /config/bonus', async () => {
    await mod.getBonusConfig()
    expect(mockGet).toHaveBeenCalledWith('/config/bonus')
  })

  it('updateBonusConfig PUT /config/bonus with body', async () => {
    const payload = { meeting_default_hours: 2, reason: '園規調整 2026 春' }
    await mod.updateBonusConfig(payload)
    expect(mockPut).toHaveBeenCalledWith('/config/bonus', payload)
  })

  it('getGradeTargets GET /config/grade-targets', async () => {
    await mod.getGradeTargets()
    expect(mockGet).toHaveBeenCalledWith('/config/grade-targets')
  })

  it('updateGradeTargets PUT /config/grade-targets with payload', async () => {
    const payload = { targets: [{ grade_id: 1, target: 30 }] }
    await mod.updateGradeTargets(payload)
    expect(mockPut).toHaveBeenCalledWith('/config/grade-targets', payload)
  })

  // ----- 職位標準底薪 -----
  it('getPositionSalary GET /config/position-salary', async () => {
    await mod.getPositionSalary()
    expect(mockGet).toHaveBeenCalledWith('/config/position-salary')
  })

  it('updatePositionSalary PUT /config/position-salary with body', async () => {
    const payload = { rows: [{ position: '園長', base: 50000 }] }
    await mod.updatePositionSalary(payload)
    expect(mockPut).toHaveBeenCalledWith('/config/position-salary', payload)
  })

  it('comparePositionSalary GET /config/position-salary/compare', async () => {
    await mod.comparePositionSalary()
    expect(mockGet).toHaveBeenCalledWith('/config/position-salary/compare')
  })

  it('syncPositionSalary POST /config/position-salary/sync wraps employee_ids (default empty)', async () => {
    await mod.syncPositionSalary()
    expect(mockPost).toHaveBeenCalledWith('/config/position-salary/sync', {
      employee_ids: [],
    })
  })

  it('syncPositionSalary POST /config/position-salary/sync wraps employee_ids', async () => {
    await mod.syncPositionSalary([1, 2, 3])
    expect(mockPost).toHaveBeenCalledWith('/config/position-salary/sync', {
      employee_ids: [1, 2, 3],
    })
  })
})
