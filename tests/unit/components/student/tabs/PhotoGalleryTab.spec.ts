import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockHasPermission = vi.fn((_name: string) => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => mockHasPermission(name),
}))

const mockList = vi.fn()
vi.mock('@/api/studentAttachments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/studentAttachments')>()
  return {
    ...actual,
    listStudentAttachments: (...args: unknown[]) => mockList(...args),
    deleteStudentAttachment: vi.fn(),
  }
})

import PhotoGalleryTab from '@/components/student/tabs/PhotoGalleryTab.vue'

// 欄位對齊後端 StudentAttachmentOut（schemas/portfolio_student_attachments.py）
const item = (id: number, ownerType: string) => ({
  id,
  owner_type: ownerType,
  owner_id: id * 10,
  original_filename: `${id}.jpg`,
  mime_type: 'image/jpeg',
  size_bytes: 100,
  url: `/api/uploads/portfolio/${id}.jpg`,
  display_url: null,
  thumb_url: null,
  uploaded_by: 1,
  created_at: '2026-10-01T09:00:00',
})

const ITEMS = [
  item(1, 'observation'),
  item(2, 'medication_order'),
  item(3, 'report'),
  item(4, 'contact_book_entry'),
  item(5, 'work_sample'),
  item(6, 'class_album'),
]

async function mountTab() {
  const w = mount(PhotoGalleryTab, {
    props: { studentId: 42 },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

/** 每張縮圖是否有刪除鈕，依 owner_type 回報。 */
function deleteButtonsByOwnerType(w: Awaited<ReturnType<typeof mountTab>>) {
  return Object.fromEntries(
    w.findAll('.thumb').map((thumb, idx) => [
      ITEMS[idx].owner_type,
      thumb.find('.thumb-delete').exists(),
    ]),
  )
}

describe('PhotoGalleryTab 刪除鈕（照片牆刪除白名單，裁定 D-02）', () => {
  beforeEach(() => {
    mockHasPermission.mockImplementation(() => true)
    mockList.mockReset()
    mockList.mockResolvedValue({ data: { total: ITEMS.length, items: ITEMS } })
  })

  it('用藥單／報告照片不顯示刪除鈕（後端一律 403），其餘來源照常可刪／移除', async () => {
    const w = await mountTab()
    expect(w.findAll('.thumb')).toHaveLength(ITEMS.length)
    expect(deleteButtonsByOwnerType(w)).toEqual({
      observation: true,
      medication_order: false,
      report: false,
      contact_book_entry: true,
      work_sample: true,
      class_album: true,
    })
  })

  it('沒有 PORTFOLIO_WRITE 時任何照片都不顯示刪除鈕', async () => {
    mockHasPermission.mockImplementation(() => false)
    const w = await mountTab()
    expect(w.findAll('.thumb')).toHaveLength(ITEMS.length)
    expect(w.findAll('.thumb-delete')).toHaveLength(0)
  })
})
