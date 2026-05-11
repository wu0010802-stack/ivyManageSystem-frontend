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
})
