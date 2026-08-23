/**
 * tests/unit/api/govMoe.test.js
 *
 * 驗證 src/api/govMoe.ts wrapper：HTTP method / URL / payload / blob 下載。
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

import * as mod from '@/api/govMoe'

describe('govMoe api', () => {
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

  // Disability Documents
  it('listDisabilityDocs GET /gov-moe/disability-documents with student_id', async () => {
    await mod.listDisabilityDocs(42)
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/disability-documents', {
      params: { student_id: 42 },
    })
  })

  it('createDisabilityDoc POST /gov-moe/disability-documents', async () => {
    const payload = { student_id: 42, doc_type: 'X' }
    await mod.createDisabilityDoc(payload)
    expect(mockPost).toHaveBeenCalledWith('/gov-moe/disability-documents', payload)
  })

  it('updateDisabilityDoc PUT /gov-moe/disability-documents/:id', async () => {
    const payload = { doc_type: 'Y' }
    await mod.updateDisabilityDoc(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/disability-documents/42', payload)
  })

  it('deleteDisabilityDoc DELETE /gov-moe/disability-documents/:id', async () => {
    await mod.deleteDisabilityDoc(42)
    expect(mockDelete).toHaveBeenCalledWith('/gov-moe/disability-documents/42')
  })

  // Dashboard Widget
  it('getDisabilityExpiryWidget GET /gov-moe/dashboard/disability-expiry default days=30', async () => {
    await mod.getDisabilityExpiryWidget()
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/dashboard/disability-expiry', {
      params: { days: 30 },
    })
  })

  it('getDisabilityExpiryWidget GET with custom days', async () => {
    await mod.getDisabilityExpiryWidget(60)
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/dashboard/disability-expiry', {
      params: { days: 60 },
    })
  })

  // Enrollment Certificates
  it('generateCertificate POST /gov-moe/certificates/:studentId/generate', async () => {
    const payload = { purpose: '就學證明' }
    await mod.generateCertificate(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/gov-moe/certificates/42/generate', payload)
  })

  it('listCertificateHistory GET /gov-moe/certificates/history with params', async () => {
    await mod.listCertificateHistory({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/certificates/history', { params: { year: 2026 } })
  })

  it('listCertificateHistory GET with default empty params', async () => {
    await mod.listCertificateHistory()
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/certificates/history', { params: {} })
  })

  it('batchGenerateCertificates POST /gov-moe/certificates/batch-generate', async () => {
    const payload = {
      student_ids: [1, 2, 3],
      issue_date: '2026-08-23',
      purpose: '入學申請',
      copies: 1,
    }
    await mod.batchGenerateCertificates(payload)
    expect(mockPost).toHaveBeenCalledWith('/gov-moe/certificates/batch-generate', payload)
  })

  // Special Subsidies
  it('listSubsidies GET /gov-moe/subsidies with params', async () => {
    await mod.listSubsidies({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/subsidies', { params: { year: 2026 } })
  })

  it('listSubsidies GET with default empty params', async () => {
    await mod.listSubsidies()
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/subsidies', { params: {} })
  })

  it('createSubsidy POST /gov-moe/subsidies', async () => {
    const payload = { student_id: 42, amount: 5000 }
    await mod.createSubsidy(payload)
    expect(mockPost).toHaveBeenCalledWith('/gov-moe/subsidies', payload)
  })

  it('updateSubsidy PUT /gov-moe/subsidies/:id', async () => {
    const payload = { amount: 6000 }
    await mod.updateSubsidy(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/subsidies/42', payload)
  })

  it('submitSubsidy PUT /gov-moe/subsidies/:id/submit', async () => {
    await mod.submitSubsidy(42)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/subsidies/42/submit')
  })

  it('approveSubsidy PUT /gov-moe/subsidies/:id/approve', async () => {
    const payload = { note: 'ok' }
    await mod.approveSubsidy(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/subsidies/42/approve', payload)
  })

  it('markSubsidyPaid PUT /gov-moe/subsidies/:id/mark_paid', async () => {
    const payload = { paid_date: '2026-05-17' }
    await mod.markSubsidyPaid(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/subsidies/42/mark_paid', payload)
  })

  it('rejectSubsidy PUT /gov-moe/subsidies/:id/reject', async () => {
    await mod.rejectSubsidy(42)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/subsidies/42/reject')
  })

  it('exportSubsidies GET /gov-moe/subsidies/export with blob + params', async () => {
    await mod.exportSubsidies({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/subsidies/export', {
      params: { year: 2026 },
      responseType: 'blob',
    })
  })

  // IEP
  it('listIeps GET /gov-moe/iep with params', async () => {
    await mod.listIeps({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/iep', { params: { year: 2026 } })
  })

  it('listIeps GET with default empty params', async () => {
    await mod.listIeps()
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/iep', { params: {} })
  })

  it('createIep POST /gov-moe/iep', async () => {
    const payload = { student_id: 42 }
    await mod.createIep(payload)
    expect(mockPost).toHaveBeenCalledWith('/gov-moe/iep', payload)
  })

  it('updateIep PUT /gov-moe/iep/:id', async () => {
    const payload = { goals: 'x' }
    await mod.updateIep(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/iep/42', payload)
  })

  it('submitIep PUT /gov-moe/iep/:id/submit', async () => {
    await mod.submitIep(42)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/iep/42/submit')
  })

  it('approveIep PUT /gov-moe/iep/:id/approve', async () => {
    await mod.approveIep(42)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/iep/42/approve')
  })

  it('closeIep PUT /gov-moe/iep/:id/close', async () => {
    await mod.closeIep(42)
    expect(mockPut).toHaveBeenCalledWith('/gov-moe/iep/42/close')
  })

  it('cloneIep POST /gov-moe/iep/:id/clone', async () => {
    const payload = { new_year: 2027 }
    await mod.cloneIep(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/gov-moe/iep/42/clone', payload)
  })

  it('exportIepPdf GET /gov-moe/iep/:id/export with blob', async () => {
    await mod.exportIepPdf(42)
    expect(mockGet).toHaveBeenCalledWith('/gov-moe/iep/42/export', {
      responseType: 'blob',
    })
  })
})
