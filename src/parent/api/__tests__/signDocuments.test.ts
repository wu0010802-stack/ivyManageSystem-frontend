import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { baseURL: 'http://test/api' },
  },
}))

import api from '../index'
import * as signDocs from '../signDocuments'

describe('parent signDocuments API wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listMySignRequests 呼叫正確路徑', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { pending: [], signed: [] } })
    await signDocs.listMySignRequests()
    expect(api.get).toHaveBeenCalledWith('/parent/me/sign-requests')
  })

  it('getMySignRequest 帶 id', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await signDocs.getMySignRequest(7)
    expect(api.get).toHaveBeenCalledWith('/parent/me/sign-requests/7')
  })

  it('signMyRequest 送 POST 帶 signature_data/confirmed_read', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { status: 'signed' } })
    await signDocs.signMyRequest(7, { signature_data: 'data:image/png;base64,abc', confirmed_read: true })
    expect(api.post).toHaveBeenCalledWith('/parent/me/sign-requests/7/sign', {
      signature_data: 'data:image/png;base64,abc',
      confirmed_read: true,
    })
  })

  it('mySignPdfUrl 組出正確絕對路徑', () => {
    expect(signDocs.mySignPdfUrl(7)).toBe('http://test/api/parent/me/sign-requests/7/pdf')
  })
})
