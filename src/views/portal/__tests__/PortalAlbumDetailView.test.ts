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

import { deleteAlbumPhoto, getAlbum, uploadAlbumPhotos } from '@/api/classAlbums'
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

describe('PortalAlbumDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAlbum).mockResolvedValue({ data: detailFixture } as never)
    vi.mocked(getMyStudents).mockResolvedValue({
      data: { classrooms: [], employee_name: '', total_students: 0 },
    } as never)
  })

  it('載入後渲染照片與標記 chips', async () => {
    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('夏日運動會')
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('未標記')
  })

  it('上傳把多檔塞進同一個 FormData 並在完成後重載', async () => {
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    vi.mocked(uploadAlbumPhotos).mockResolvedValue({
      data: {
        items: [
          { filename: 'a.jpg', ok: true },
          { filename: 'b.jpg', ok: false, error: '格式不支援' },
        ],
      },
    } as never)

    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()
    const vm = wrapper.vm as unknown as { handleUpload: (files: File[]) => Promise<void> }

    await vm.handleUpload([fileA, fileB])
    await flushPromises()

    expect(uploadAlbumPhotos).toHaveBeenCalledTimes(1)
    const formData = vi.mocked(uploadAlbumPhotos).mock.calls[0][1]
    expect(formData.getAll('files')).toHaveLength(2)
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(getAlbum).toHaveBeenCalledTimes(2)
  })

  it('刪除照片呼叫 deleteAlbumPhoto 並重載', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(deleteAlbumPhoto).mockResolvedValue({ data: {} } as never)

    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()
    const vm = wrapper.vm as unknown as { removePhoto: (photoId: number) => Promise<void> }

    await vm.removePhoto(11)
    await flushPromises()

    expect(deleteAlbumPhoto).toHaveBeenCalledWith(1, 11)
    expect(getAlbum).toHaveBeenCalledTimes(2)
  })

  it('刪除照片 confirm 取消時不呼叫 deleteAlbumPhoto 也不拋出例外', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    const wrapper = mount(PortalAlbumDetailView)
    await flushPromises()
    const vm = wrapper.vm as unknown as { removePhoto: (photoId: number) => Promise<void> }

    await expect(vm.removePhoto(11)).resolves.toBeUndefined()
    await flushPromises()

    expect(deleteAlbumPhoto).not.toHaveBeenCalled()
    expect(getAlbum).toHaveBeenCalledTimes(1)
  })
})
