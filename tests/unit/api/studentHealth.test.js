/**
 * tests/unit/api/studentHealth.test.js
 *
 * 薄殼測試：驗 src/api/studentHealth.ts wrapper 把 HTTP method/URL/params/body
 * 正確轉發給 @/api/index axios 實例。
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
  },
}))

import * as mod from '@/api/studentHealth'

describe('studentHealth api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
  })

  // ============ Allergies ============
  it('listAllergies GET /students/:id/allergies with params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.listAllergies(42, { active: true })
    expect(mockGet).toHaveBeenCalledWith('/students/42/allergies', {
      params: { active: true },
    })
  })

  it('listAllergies defaults params to empty object', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.listAllergies(42)
    expect(mockGet).toHaveBeenCalledWith('/students/42/allergies', { params: {} })
  })

  it('createAllergy POST /students/:id/allergies with body', async () => {
    mockPost.mockResolvedValue({ data: { id: 1 } })
    const payload = { allergen: '花生', severity: 'severe' }
    await mod.createAllergy(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/students/42/allergies', payload)
  })

  it('updateAllergy PATCH /students/:id/allergies/:algId with body', async () => {
    mockPatch.mockResolvedValue({ data: {} })
    const payload = { severity: 'mild' }
    await mod.updateAllergy(42, 7, payload)
    expect(mockPatch).toHaveBeenCalledWith('/students/42/allergies/7', payload)
  })

  it('deleteAllergy DELETE /students/:id/allergies/:algId', async () => {
    mockDelete.mockResolvedValue({ data: {} })
    await mod.deleteAllergy(42, 7)
    expect(mockDelete).toHaveBeenCalledWith('/students/42/allergies/7')
  })

  // ============ Medication orders ============
  it('listMedicationOrders GET /students/:id/medication-orders with params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.listMedicationOrders(42, { status: 'active' })
    expect(mockGet).toHaveBeenCalledWith('/students/42/medication-orders', {
      params: { status: 'active' },
    })
  })

  it('listMedicationOrders defaults params to empty object', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.listMedicationOrders(42)
    expect(mockGet).toHaveBeenCalledWith('/students/42/medication-orders', { params: {} })
  })

  it('getMedicationOrder GET /students/:id/medication-orders/:orderId', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await mod.getMedicationOrder(42, 99)
    expect(mockGet).toHaveBeenCalledWith('/students/42/medication-orders/99')
  })

  it('createMedicationOrder POST /students/:id/medication-orders with body', async () => {
    mockPost.mockResolvedValue({ data: { id: 1 } })
    const payload = { medication: '退燒藥', dosage: '5ml' }
    await mod.createMedicationOrder(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/students/42/medication-orders', payload)
  })

  // ============ Medication logs ============
  it('administerMedication POST /medication-logs/:id/administer with body', async () => {
    mockPost.mockResolvedValue({ data: {} })
    const payload = { actual_time: '2026-05-17T09:00:00' }
    await mod.administerMedication(11, payload)
    expect(mockPost).toHaveBeenCalledWith('/medication-logs/11/administer', payload)
  })

  it('administerMedication defaults body to empty object', async () => {
    mockPost.mockResolvedValue({ data: {} })
    await mod.administerMedication(11)
    expect(mockPost).toHaveBeenCalledWith('/medication-logs/11/administer', {})
  })

  it('skipMedication POST /medication-logs/:id/skip with body', async () => {
    mockPost.mockResolvedValue({ data: {} })
    const payload = { reason: '請假' }
    await mod.skipMedication(11, payload)
    expect(mockPost).toHaveBeenCalledWith('/medication-logs/11/skip', payload)
  })

  it('correctMedicationLog POST /medication-logs/:id/correct with body', async () => {
    mockPost.mockResolvedValue({ data: {} })
    const payload = { correction: '誤填' }
    await mod.correctMedicationLog(11, payload)
    expect(mockPost).toHaveBeenCalledWith('/medication-logs/11/correct', payload)
  })

  // ============ Today-medication ============
  it('getTodayMedication GET /portfolio/today-medication', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.getTodayMedication()
    expect(mockGet).toHaveBeenCalledWith('/portfolio/today-medication')
  })
})
