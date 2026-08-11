import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    defaults: { baseURL: 'http://test/api' },
  },
}))

import api from '@/api'
import * as signDocs from '../signDocuments'

describe('signDocuments API wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listSignTemplates sends GET with params', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })
    await signDocs.listSignTemplates({ include_inactive: true })
    expect(api.get).toHaveBeenCalledWith(
      '/sign-documents/templates',
      expect.objectContaining({ params: { include_inactive: true } }),
    )
  })

  it('createSignTemplate sends POST with body', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    const body = { title: '入學契約', doc_type: 'contract', body_md: 'x' }
    await signDocs.createSignTemplate(body)
    expect(api.post).toHaveBeenCalledWith('/sign-documents/templates', body)
  })

  it('updateSignTemplate sends PUT to template id', async () => {
    ;(api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    const body = { title: 'x', doc_type: 'contract', body_md: 'y' }
    await signDocs.updateSignTemplate(5, body)
    expect(api.put).toHaveBeenCalledWith('/sign-documents/templates/5', body)
  })

  it('createSignBatch sends POST with student_ids/template_ids', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { created: 2, batch_id: 'b1', skipped: [], unnotifiable_student_ids: [] },
    })
    const body = { student_ids: [1, 2], template_ids: [3] }
    const resp = await signDocs.createSignBatch(body)
    expect(api.post).toHaveBeenCalledWith('/sign-documents/requests/batch', body)
    expect(resp.data.created).toBe(2)
  })

  it('listSignRequests sends GET with filter params', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })
    await signDocs.listSignRequests({ status: 'pending' })
    expect(api.get).toHaveBeenCalledWith(
      '/sign-documents/requests',
      expect.objectContaining({ params: { status: 'pending' } }),
    )
  })

  it('getSignRequest sends GET to request id', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await signDocs.getSignRequest(7)
    expect(api.get).toHaveBeenCalledWith('/sign-documents/requests/7')
  })

  it('voidSignRequest sends POST with reason', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await signDocs.voidSignRequest(7, { reason: '重複發送' })
    expect(api.post).toHaveBeenCalledWith('/sign-documents/requests/7/void', {
      reason: '重複發送',
    })
  })

  it('resendSignNotification sends POST with no body', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { notified: 1 } })
    await signDocs.resendSignNotification(7)
    expect(api.post).toHaveBeenCalledWith('/sign-documents/requests/7/resend-notification')
  })

  it('signRequestPdfUrl builds absolute url from baseURL', () => {
    expect(signDocs.signRequestPdfUrl(7)).toBe(
      'http://test/api/sign-documents/requests/7/pdf',
    )
  })
})
