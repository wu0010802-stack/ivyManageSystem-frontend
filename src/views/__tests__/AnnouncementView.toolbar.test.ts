import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { recipients: [] } }),
  replaceAnnouncementParentRecipients: vi.fn(),
  getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { recipient_ids: [] } }),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }
})
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn() }),
}))
// 公告頁改吃跨學期班級清單（見 stores/classroomAll.ts）
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

import AnnouncementView from '@/views/AnnouncementView.vue'
import { getAnnouncements } from '@/api/announcements'

const globalConfig = {
  stubs: {
    teleport: true,
    'el-table-column': { template: '<span />' },
  },
}

describe('AnnouncementView 清單工具列', () => {
  beforeEach(() => vi.clearAllMocks())

  it('掛載即帶 page/page_size 呼叫（修資料遺失）', async () => {
    shallowMount(AnnouncementView, { global: globalConfig })
    await flushPromises()
    expect(getAnnouncements).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 50 }),
    )
  })

  it('優先級篩選帶 priority 重新查詢', async () => {
    const wrapper = shallowMount(AnnouncementView, { global: globalConfig })
    await flushPromises()
    ;(wrapper.vm as unknown as { onAnnFilterChange: (v: Record<string, unknown>) => void })
      .onAnnFilterChange({ priority: 'urgent' })
    await flushPromises()
    expect(getAnnouncements).toHaveBeenCalledWith(expect.objectContaining({ priority: 'urgent' }))
  })
})
