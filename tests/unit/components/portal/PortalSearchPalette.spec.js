import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import PortalSearchPalette from '@/components/portal/PortalSearchPalette.vue'
import { usePortalSearch } from '@/composables/usePortalSearch'
import * as apiSearch from '@/api/portalSearch'

vi.mock('@/api/portalSearch')

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const mountOpts = () => ({
  global: { stubs: { teleport: true } },
  attachTo: document.body,
})

describe('PortalSearchPalette', () => {
  beforeEach(() => {
    apiSearch.searchPortal = vi.fn().mockResolvedValue({
      data: {
        q: '請假',
        students: [],
        guardians: [],
        messages: [],
        contact_book: [],
        announcements: [],
      },
    })
    pushMock.mockReset()
    const { isOpen } = usePortalSearch()
    isOpen.value = true
  })

  afterEach(() => {
    const { isOpen } = usePortalSearch()
    isOpen.value = false
  })

  it('matches "請假" command and Enter pushes /portal/leave', async () => {
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await wrapper.find('[data-test="search-input"]').setValue('請假')
    await nextTick()
    const leaveItem = wrapper.find('[data-test="command-leave"]')
    expect(leaveItem.exists()).toBe(true)
    await wrapper.find('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(pushMock).toHaveBeenCalledWith('/portal/leave')
    wrapper.unmount()
  })

  it('Esc closes palette', async () => {
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await wrapper.find('[data-test="search-input"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    const { isOpen } = usePortalSearch()
    expect(isOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('ArrowDown moves activeIndex', async () => {
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await wrapper.find('[data-test="search-input"]').setValue('a')
    await nextTick()
    const before = wrapper.vm.activeIndex
    await wrapper.find('[data-test="search-input"]').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(wrapper.vm.activeIndex).toBe(before + 1)
    wrapper.unmount()
  })

  it('debounces API calls (300ms)', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await wrapper.find('[data-test="search-input"]').setValue('小')
    await wrapper.find('[data-test="search-input"]').setValue('小明')
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(apiSearch.searchPortal).toHaveBeenCalledTimes(1)
    expect(apiSearch.searchPortal).toHaveBeenLastCalledWith('小明')
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('short query (< 2 chars) does not call API', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await wrapper.find('[data-test="search-input"]').setValue('a')
    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(apiSearch.searchPortal).not.toHaveBeenCalled()
    vi.useRealTimers()
    wrapper.unmount()
  })

  // 回歸：deep-link 契約。原本 student/guardian 多了 /detail 段不匹配任何路由
  // （點了沒反應），message 走會丟 query 的靜態 redirect。
  const typeAndEnter = async (wrapper, results) => {
    apiSearch.searchPortal = vi.fn().mockResolvedValue({
      data: { q: '小明', students: [], guardians: [], messages: [], contact_book: [], announcements: [], ...results },
    })
    await wrapper.find('[data-test="search-input"]').setValue('小明')
    // 等真實 debounce（300ms）觸發後續 API 與結果填充
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    await nextTick()
    await wrapper.find('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    await nextTick()
  }

  it('selecting a student pushes named route (no dead /detail segment)', async () => {
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await typeAndEnter(wrapper, { students: [{ id: 42, name: '小明', classroom_name: '星星班' }] })
    expect(pushMock).toHaveBeenCalledWith({ name: 'portal-student-detail', params: { studentId: '42' } })
    wrapper.unmount()
  })

  it('selecting a guardian opens student detail on guardians tab', async () => {
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await typeAndEnter(wrapper, { guardians: [{ id: 7, student_id: 42, name: '媽媽', child_name: '小明' }] })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'portal-student-detail',
      params: { studentId: '42' },
      query: { tab: 'guardians' },
    })
    wrapper.unmount()
  })

  it('selecting a message routes through messages/:threadId (query not dropped)', async () => {
    const wrapper = mount(PortalSearchPalette, mountOpts())
    await typeAndEnter(wrapper, { messages: [{ thread_id: 99, student_name: '小明', snippet: '你好' }] })
    expect(pushMock).toHaveBeenCalledWith('/portal/messages/99')
    wrapper.unmount()
  })
})
