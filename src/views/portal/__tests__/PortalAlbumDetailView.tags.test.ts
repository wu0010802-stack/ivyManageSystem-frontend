import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '1' } }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/api/classAlbums', () => ({
  getAlbum: vi.fn(),
  uploadAlbumPhotos: vi.fn(),
  deleteAlbumPhoto: vi.fn(),
  setPhotoTags: vi.fn(),
  publishAlbum: vi.fn(),
}))
vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { getAlbum, publishAlbum, setPhotoTags } from '@/api/classAlbums'
import { getMyStudents } from '@/api/portal'
import { ElMessage, ElMessageBox } from 'element-plus'
import PortalAlbumDetailView from '../PortalAlbumDetailView.vue'

const detailFixture = {
  id: 1, classroom_id: 10, title: '夏日運動會', description: null, event_date: '2026-07-25',
  status: 'draft', published_at: null, photo_count: 2, untagged_count: 1, cover_thumb_url: '/t1.jpg',
  photos: [
    { id: 11, thumb_url: '/t1.jpg', display_url: '/d1.jpg', original_filename: 'a.jpg', created_at: '2026-07-25T10:00:00', students: [{ id: 5, name: '王小明' }] },
    { id: 12, thumb_url: '/t2.jpg', display_url: '/d2.jpg', original_filename: 'b.jpg', created_at: '2026-07-25T10:01:00', students: [] },
  ],
}

const studentsFixture = {
  classrooms: [
    {
      classroom_id: 10,
      classroom_name: '向日葵班',
      role: 'lead',
      student_count: 2,
      students: [
        { id: 5, name: '王小明', has_health_alert: false, health_alert_count: 0 },
        { id: 6, name: '陳小美', has_health_alert: false, health_alert_count: 0 },
      ],
    },
  ],
  employee_name: '林老師',
  total_students: 2,
}

describe('PortalAlbumDetailView - 標記與發布', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAlbum).mockResolvedValue({ data: detailFixture } as never)
    vi.mocked(getMyStudents).mockResolvedValue({ data: studentsFixture } as never)
  })

  it('批次標記把選取照片各自 replace 成選定學生', async () => {
    vi.mocked(setPhotoTags).mockResolvedValue({ data: {} } as never)
    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      toggleSelect: (id: number) => void
      tagForm: { studentIds: number[] }
      applyTags: () => Promise<void>
    }

    vm.toggleSelect(11)
    vm.toggleSelect(12)
    vm.tagForm.studentIds = [5, 6]
    await vm.applyTags()
    await flushPromises()

    expect(setPhotoTags).toHaveBeenCalledWith(1, [
      { attachment_id: 11, student_ids: [5, 6] },
      { attachment_id: 12, student_ids: [5, 6] },
    ])
    expect(getAlbum).toHaveBeenCalledTimes(2)
  })

  it('發布時未標記數出現在確認文案，確認後呼叫 publishAlbum', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(publishAlbum).mockResolvedValue({ data: {} } as never)
    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()
    const vm = wrapper.vm as unknown as { handlePublish: () => Promise<void> }

    await vm.handlePublish()
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('1 張未標記'),
      '發布相簿',
      expect.objectContaining({ type: 'warning' }),
    )
    expect(publishAlbum).toHaveBeenCalledWith(1)
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('發布 API 400 時顯示錯誤訊息', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(publishAlbum).mockRejectedValue({ response: { status: 400 } })
    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()
    const vm = wrapper.vm as unknown as { handlePublish: () => Promise<void> }

    await vm.handlePublish()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('發布 confirm 取消時不呼叫 publishAlbum 也不拋出例外', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()
    const vm = wrapper.vm as unknown as { handlePublish: () => Promise<void> }

    await expect(vm.handlePublish()).resolves.toBeUndefined()
    await flushPromises()

    expect(publishAlbum).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
