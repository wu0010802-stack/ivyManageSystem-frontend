/**
 * tests/unit/api/students.test.js
 *
 * 薄殼測試：驗證 src/api/students.ts 每個 exported function 的 method/URL/payload。
 * 涵蓋學生 CRUD + lifecycle 轉移 + guardian 管理 + LINE LIFF 綁定碼。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    patch: mockPatch,
    delete: mockDelete,
  },
}))

import * as mod from '@/api/students'

describe('students api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockPatch.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockPatch.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('getStudents GET /students with params', async () => {
    const params = { classroom_id: 3, status: 'active' }
    await mod.getStudents(params)
    expect(mockGet).toHaveBeenCalledWith('/students', { params })
  })

  it('getStudent GET /students/:id', async () => {
    await mod.getStudent(42)
    expect(mockGet).toHaveBeenCalledWith('/students/42')
  })

  it('createStudent POST /students with body', async () => {
    const payload = { name: '王小明', birthday: '2020-01-01' }
    await mod.createStudent(payload)
    expect(mockPost).toHaveBeenCalledWith('/students', payload)
  })

  it('updateStudent PUT /students/:id with body', async () => {
    const payload = { name: '王大明' }
    await mod.updateStudent(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/students/42', payload)
  })

  it('graduateStudent POST /students/:id/graduate with body', async () => {
    const payload = { graduation_date: '2026-07-31' }
    await mod.graduateStudent(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/students/42/graduate', payload)
  })

  it('bulkTransferStudents POST /students/bulk-transfer with body', async () => {
    const payload = { student_ids: [1, 2], to_classroom_id: 5 }
    await mod.bulkTransferStudents(payload)
    expect(mockPost).toHaveBeenCalledWith('/students/bulk-transfer', payload)
  })

  it('previewBonusImpact POST /bonus-impact-preview with body', async () => {
    const payload = { classroom_id: 3, month: '2026-05' }
    await mod.previewBonusImpact(payload)
    expect(mockPost).toHaveBeenCalledWith('/bonus-impact-preview', payload)
  })

  it('getStudentProfile GET /students/:id/profile with default empty params', async () => {
    await mod.getStudentProfile(42)
    expect(mockGet).toHaveBeenCalledWith('/students/42/profile', { params: {} })
  })

  it('getStudentProfile GET /students/:id/profile with params', async () => {
    const params = { include_timeline: true }
    await mod.getStudentProfile(42, params)
    expect(mockGet).toHaveBeenCalledWith('/students/42/profile', { params })
  })

  it('transitionStudentLifecycle POST /students/:id/lifecycle with body', async () => {
    const payload = {
      to_status: 'withdrawn',
      effective_date: '2026-05-17',
      reason: '搬家',
    }
    await mod.transitionStudentLifecycle(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/students/42/lifecycle', payload)
  })

  it('listGuardians GET /students/:studentId/guardians', async () => {
    await mod.listGuardians(42)
    expect(mockGet).toHaveBeenCalledWith('/students/42/guardians')
  })

  it('createGuardian POST /students/:studentId/guardians with body', async () => {
    const payload = { name: '家長', phone: '0912345678' }
    await mod.createGuardian(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/students/42/guardians', payload)
  })

  it('updateGuardian PATCH /students/guardians/:guardianId with body', async () => {
    const payload = { phone: '0987654321' }
    await mod.updateGuardian(99, payload)
    expect(mockPatch).toHaveBeenCalledWith('/students/guardians/99', payload)
  })

  it('deleteGuardian DELETE /students/guardians/:guardianId', async () => {
    await mod.deleteGuardian(99)
    expect(mockDelete).toHaveBeenCalledWith('/students/guardians/99')
  })

  it('createGuardianBindingCode POST /guardians/:guardianId/binding-code', async () => {
    await mod.createGuardianBindingCode(99)
    expect(mockPost).toHaveBeenCalledWith('/guardians/99/binding-code')
  })

  it('createGuardianDeviceSetupCode POST /guardians/:guardianId/device-setup-code', async () => {
    await mod.createGuardianDeviceSetupCode(99)
    expect(mockPost).toHaveBeenCalledWith('/guardians/99/device-setup-code')
  })

  it('revokeGuardianDevices POST /guardians/:guardianId/revoke-devices', async () => {
    await mod.revokeGuardianDevices(99)
    expect(mockPost).toHaveBeenCalledWith('/guardians/99/revoke-devices')
  })
})
