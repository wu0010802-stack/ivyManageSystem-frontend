/**
 * tests/unit/api/employees.test.js
 *
 * 驗證 src/api/employees.js wrapper：HTTP method / URL / payload 對齊。
 * 不驗業務邏輯（不算薪、不算 final salary），只驗參數轉發。
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

import * as mod from '@/api/employees'

describe('employees api', () => {
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

  it('getEmployees GET /employees with params', async () => {
    await mod.getEmployees({ status: 'active' })
    expect(mockGet).toHaveBeenCalledWith('/employees', { params: { status: 'active' } })
  })

  it('getEmployee GET /employees/:id', async () => {
    await mod.getEmployee(42)
    expect(mockGet).toHaveBeenCalledWith('/employees/42')
  })

  it('createEmployee POST /employees', async () => {
    const payload = { name: 'A', base_salary: 30000 }
    await mod.createEmployee(payload)
    expect(mockPost).toHaveBeenCalledWith('/employees', payload)
  })

  it('updateEmployee PUT /employees/:id', async () => {
    const payload = { name: 'B' }
    await mod.updateEmployee(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/employees/42', payload)
  })

  it('offboard POST /employees/:id/offboard', async () => {
    const payload = { last_day: '2026-05-31' }
    await mod.offboard(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/employees/42/offboard', payload)
  })

  it('getFinalSalaryPreview GET /employees/:id/final-salary-preview with params', async () => {
    await mod.getFinalSalaryPreview(42, { last_day: '2026-05-31' })
    expect(mockGet).toHaveBeenCalledWith('/employees/42/final-salary-preview', {
      params: { last_day: '2026-05-31' },
    })
  })

  it('updateEmployeeBasic PUT /employees/:id with dirty payload', async () => {
    await mod.updateEmployeeBasic(42, { phone: '0912' })
    expect(mockPut).toHaveBeenCalledWith('/employees/42', { phone: '0912' })
  })

  it('updateEmployeeSalary PUT /employees/:id with dirty payload', async () => {
    await mod.updateEmployeeSalary(42, { base_salary: 31000 })
    expect(mockPut).toHaveBeenCalledWith('/employees/42', { base_salary: 31000 })
  })

  // Educations
  it('listEmployeeEducations GET /employees/:id/educations', async () => {
    await mod.listEmployeeEducations(42)
    expect(mockGet).toHaveBeenCalledWith('/employees/42/educations')
  })

  it('createEmployeeEducation POST /employees/:id/educations', async () => {
    const payload = { school: 'NTU', degree: 'BA' }
    await mod.createEmployeeEducation(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/employees/42/educations', payload)
  })

  it('updateEmployeeEducation PUT /employees/:id/educations/:eduId', async () => {
    const payload = { school: 'NTU' }
    await mod.updateEmployeeEducation(42, 7, payload)
    expect(mockPut).toHaveBeenCalledWith('/employees/42/educations/7', payload)
  })

  it('deleteEmployeeEducation DELETE /employees/:id/educations/:eduId', async () => {
    await mod.deleteEmployeeEducation(42, 7)
    expect(mockDelete).toHaveBeenCalledWith('/employees/42/educations/7')
  })

  // Certificates
  it('listEmployeeCertificates GET /employees/:id/certificates', async () => {
    await mod.listEmployeeCertificates(42)
    expect(mockGet).toHaveBeenCalledWith('/employees/42/certificates')
  })

  it('createEmployeeCertificate POST /employees/:id/certificates', async () => {
    const payload = { name: '幼教證' }
    await mod.createEmployeeCertificate(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/employees/42/certificates', payload)
  })

  it('updateEmployeeCertificate PUT /employees/:id/certificates/:certId', async () => {
    const payload = { name: 'X' }
    await mod.updateEmployeeCertificate(42, 9, payload)
    expect(mockPut).toHaveBeenCalledWith('/employees/42/certificates/9', payload)
  })

  it('deleteEmployeeCertificate DELETE /employees/:id/certificates/:certId', async () => {
    await mod.deleteEmployeeCertificate(42, 9)
    expect(mockDelete).toHaveBeenCalledWith('/employees/42/certificates/9')
  })

  // Contracts
  it('listEmployeeContracts GET /employees/:id/contracts', async () => {
    await mod.listEmployeeContracts(42)
    expect(mockGet).toHaveBeenCalledWith('/employees/42/contracts')
  })

  it('createEmployeeContract POST /employees/:id/contracts', async () => {
    const payload = { start_date: '2026-01-01' }
    await mod.createEmployeeContract(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/employees/42/contracts', payload)
  })

  it('updateEmployeeContract PUT /employees/:id/contracts/:cid', async () => {
    const payload = { end_date: '2026-12-31' }
    await mod.updateEmployeeContract(42, 11, payload)
    expect(mockPut).toHaveBeenCalledWith('/employees/42/contracts/11', payload)
  })

  it('deleteEmployeeContract DELETE /employees/:id/contracts/:cid', async () => {
    await mod.deleteEmployeeContract(42, 11)
    expect(mockDelete).toHaveBeenCalledWith('/employees/42/contracts/11')
  })
})
