import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listStudentAttachments,
  OWNER_TYPE_LABELS,
} from '@/api/studentAttachments'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn() },
}))

describe('studentAttachments api', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('listStudentAttachments hits /students/{id}/attachments with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listStudentAttachments(42, { owner_type: 'observation' })
    expect(api.get).toHaveBeenCalledWith('/students/42/attachments', {
      params: { owner_type: 'observation' },
    })
  })

  it('listStudentAttachments defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listStudentAttachments(42)
    expect(api.get).toHaveBeenCalledWith('/students/42/attachments', { params: {} })
  })

  it('exports OWNER_TYPE_LABELS map with expected keys', () => {
    expect(OWNER_TYPE_LABELS).toMatchObject({
      observation: '觀察記錄',
      contact_book_entry: '聯絡簿',
      medication_order: '用藥單',
      report: '報告',
    })
  })
})
