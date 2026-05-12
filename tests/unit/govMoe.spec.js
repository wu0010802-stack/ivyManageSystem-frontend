import { describe, it, expect, vi } from 'vitest'
import * as govMoe from '@/api/govMoe'
import api from '@/api/index'

vi.mock('@/api/index')

describe('govMoe API module', () => {
  it('listDisabilityDocs hits the correct endpoint', async () => {
    api.get = vi.fn().mockResolvedValue({ data: [] })
    await govMoe.listDisabilityDocs(123)
    expect(api.get).toHaveBeenCalledWith('/gov-moe/disability-documents', {
      params: { student_id: 123 },
    })
  })

  it('createDisabilityDoc posts payload', async () => {
    api.post = vi.fn().mockResolvedValue({ data: {} })
    const payload = { student_id: 1, doc_type: '鑑定證明', file_path: '/a.pdf' }
    await govMoe.createDisabilityDoc(payload)
    expect(api.post).toHaveBeenCalledWith('/gov-moe/disability-documents', payload)
  })

  it('getDisabilityExpiryWidget calls dashboard endpoint', async () => {
    api.get = vi.fn().mockResolvedValue({ data: { total: 0, students: [] } })
    await govMoe.getDisabilityExpiryWidget(30)
    expect(api.get).toHaveBeenCalledWith('/gov-moe/dashboard/disability-expiry', {
      params: { days: 30 },
    })
  })

  it('generateCertificate posts to correct URL', async () => {
    api.post = vi.fn().mockResolvedValue({ data: {} })
    const payload = { issue_date: '2026-05-12', purpose: 'p', copies: 1 }
    await govMoe.generateCertificate(7, payload)
    expect(api.post).toHaveBeenCalledWith(
      '/gov-moe/certificates/7/generate',
      payload
    )
  })

  it('listCertificateHistory queries history endpoint', async () => {
    api.get = vi.fn().mockResolvedValue({ data: [] })
    const params = { student_id: 7 }
    await govMoe.listCertificateHistory(params)
    expect(api.get).toHaveBeenCalledWith('/gov-moe/certificates/history', {
      params,
    })
  })
})

describe('govMoe phase 4B', () => {
  it('createSubsidy posts to correct URL', async () => {
    vi.resetModules()
    vi.doMock('../../src/api/index', () => ({
      default: { post: vi.fn().mockResolvedValue({ data: {} }) }
    }))
    const api = (await import('../../src/api/index')).default
    const { createSubsidy } = await import('../../src/api/govMoe')
    await createSubsidy({ subsidy_type: 'teacher_extra', employee_id: 1,
                          period_start: '2026-05-01', period_end: '2026-05-31',
                          amount_requested: '0' })
    expect(api.post).toHaveBeenCalledWith('/gov-moe/subsidies',
      expect.objectContaining({ subsidy_type: 'teacher_extra' }))
  })
})
