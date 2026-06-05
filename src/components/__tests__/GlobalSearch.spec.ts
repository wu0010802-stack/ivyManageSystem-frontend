// src/components/__tests__/GlobalSearch.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import GlobalSearch from '../GlobalSearch.vue'
import * as searchApi from '@/api/search'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, getRoutes: () => [] }),
}))
vi.mock('@/utils/auth', () => ({ canAccessRoute: () => true }))
vi.mock('@/utils/highlight', () => ({ highlight: (s: string) => s }))
vi.mock('@/api/search')

const mountOpts = () => ({
  global: { stubs: { teleport: true } },
  attachTo: document.body,
})

const emptyData = {
  q: '', students: [], employees: [], guardians: [], classrooms: [],
  fees: [], activity_registrations: [], recruitment: [], announcements: [],
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    push.mockClear()
    // NOTE: do NOT call mockReset here - it breaks the component's live binding
    // in subsequent tests. Instead set implementation fresh per test.
    vi.mocked(searchApi.globalSearch).mockResolvedValue({ data: emptyData } as never)
  })

  it('短於 2 字不呼叫 API', async () => {
    const wrapper = mount(GlobalSearch, mountOpts())
    ;(wrapper.vm as any).open()
    await nextTick()
    await wrapper.find('input').setValue('a')
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    expect(searchApi.globalSearch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('≥ 2 字呼叫 API 並渲染學生區塊 + 點擊跳檔案頁', async () => {
    vi.mocked(searchApi.globalSearch).mockResolvedValue({
      data: {
        ...emptyData,
        q: '王小',
        students: [{ id: 7, name: '王小明', student_id: 'S1', classroom_name: 'A班' }],
      },
    } as never)
    const wrapper = mount(GlobalSearch, mountOpts())
    ;(wrapper.vm as any).open()
    await nextTick()
    // 注意：單一 CJK 字 len==1，會被 ≥2 字門檻擋掉，用 2 字才會打 API
    await wrapper.find('input').setValue('王小')
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    expect(searchApi.globalSearch).toHaveBeenCalledWith('王小')
    expect(wrapper.text()).toContain('王小明')
    await nextTick()
    await wrapper.find('.gs-item').trigger('click')
    expect(push).toHaveBeenCalledWith('/students/profile/7')
    wrapper.unmount()
  })
})
