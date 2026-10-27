import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))
vi.mock('@/api/classAlbums', () => ({
  listAlbums: vi.fn(),
  createAlbum: vi.fn(),
  getAlbumClassrooms: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { createAlbum, getAlbumClassrooms, listAlbums } from '@/api/classAlbums'
import PortalAlbumsView from '../PortalAlbumsView.vue'

const albumFixture = {
  id: 1, classroom_id: 10, title: '夏日運動會', description: null,
  event_date: '2026-07-25', status: 'draft', published_at: null,
  photo_count: 3, untagged_count: 2, cover_thumb_url: '/api/uploads/portfolio/t.jpg',
}

describe('PortalAlbumsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAlbums).mockResolvedValue({ data: [albumFixture] } as never)
    vi.mocked(getAlbumClassrooms).mockResolvedValue({ data: [{ id: 10, name: '向日葵班' }] } as never)
  })

  it('載入後渲染相簿卡片與未標記提示', async () => {
    const wrapper = mount(PortalAlbumsView)
    await flushPromises()
    expect(wrapper.text()).toContain('夏日運動會')
    expect(wrapper.text()).toContain('草稿')
    expect(wrapper.text()).toContain('未標記 2 張')
  })

  it('建立相簿呼叫 createAlbum 並重新載入', async () => {
    vi.mocked(createAlbum).mockResolvedValue({ data: { ...albumFixture, id: 2 } } as never)
    const wrapper = mount(PortalAlbumsView)
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      createForm: { classroom_id: number | null; title: string; event_date: string; description: string }
      submitCreate: () => Promise<void>
    }
    vm.createForm.classroom_id = 10
    vm.createForm.title = '校外教學'
    vm.createForm.event_date = '2026-07-30'
    await vm.submitCreate()
    expect(createAlbum).toHaveBeenCalledWith({
      classroom_id: 10, title: '校外教學', event_date: '2026-07-30', description: undefined,
    })
    expect(listAlbums).toHaveBeenCalledTimes(2)
  })

  it('點卡片導向明細頁', async () => {
    const wrapper = mount(PortalAlbumsView)
    await flushPromises()
    await wrapper.find('[data-test="album-card"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/portal/albums/1')
  })

  it('相簿載入失敗 → 顯示錯誤與重試，不顯示「還沒有相簿」', async () => {
    vi.mocked(listAlbums).mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(PortalAlbumsView)
    await flushPromises()
    expect(wrapper.text()).not.toContain('還沒有相簿')
    const err = wrapper.findComponent({ name: 'PortalErrorState' })
    expect(err.exists()).toBe(true)
    err.vm.$emit('retry')
    await flushPromises()
    expect(wrapper.text()).toContain('夏日運動會')
  })

  it('班級清單失敗不影響相簿列表', async () => {
    vi.mocked(getAlbumClassrooms).mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(PortalAlbumsView)
    await flushPromises()
    expect(wrapper.text()).toContain('夏日運動會')
  })

  it('建立成功但重新載入失敗 → 不誤報「建立失敗」', async () => {
    const { ElMessage } = await import('element-plus')
    vi.mocked(createAlbum).mockResolvedValue({ data: { ...albumFixture, id: 2 } } as never)
    const wrapper = mount(PortalAlbumsView)
    await flushPromises()
    vi.mocked(listAlbums).mockRejectedValueOnce(new Error('boom'))
    const vm = wrapper.vm as unknown as {
      createForm: { classroom_id: number | null; title: string; event_date: string; description: string }
      submitCreate: () => Promise<void>
    }
    Object.assign(vm.createForm, { classroom_id: 10, title: '校外教學', event_date: '2026-07-30' })
    await vm.submitCreate()
    expect(ElMessage.success).toHaveBeenCalledWith('相簿已建立')
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
