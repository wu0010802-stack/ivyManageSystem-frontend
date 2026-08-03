import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// ── 模擬 vue-router（view 用 useRoute 取 query.token）──────────────────────
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

// ── 模擬 API ──────────────────────────────────────────────────────────────
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: {
      courses: [{ name: '美術', price: 3000 }],
      supplies: [],
      classes: ['大班', '小班'],
      course_videos: {},
    },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: { 美術: 5 } }),
}))

import { publicQueryByToken } from '@/api/activityPublic'

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicQueryView = (await import('../ActivityPublicQueryView.vue')).default
  return mount(ActivityPublicQueryView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
}

function dispatchBeforeUnload(): Event {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

/**
 * #6：多步表單無離開防護。dirty 判定＝已進入編輯報名狀態
 * （有 queryResult 且可修改、非已付款鎖定）且 editForm 與最近一次 hydrate 進來的
 * 基準值不同；儲存成功後 hydrateResult 重設基準值，dirty 應解除。
 */
describe('ActivityPublicQueryView — beforeunload 離開防護（#6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publicQueryByToken).mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        parent_phone: '0912345678',
        school_year: 113,
        semester: 2,
        courses: [],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
        query_token_required: true,
        is_paid: false,
      },
    } as never)
  })

  it('查詢命中但尚未編輯：beforeunload 不攔截', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      queryForm: { token: string; parent_phone: string }
      handleQuery: () => Promise<void>
    }
    vm.queryForm.token = 'TESTTOKEN123'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()
    await flushPromises()

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('編輯班級後未儲存：beforeunload 會被攔截', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      queryForm: { token: string; parent_phone: string }
      handleQuery: () => Promise<void>
      editForm: { class_name: string }
    }
    vm.queryForm.token = 'TESTTOKEN123'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()
    await flushPromises()

    vm.editForm.class_name = '小班'
    await wrapper.vm.$nextTick()

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('卸載元件後 beforeunload 監聽器已移除，不再攔截', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      queryForm: { token: string; parent_phone: string }
      handleQuery: () => Promise<void>
      editForm: { class_name: string }
    }
    vm.queryForm.token = 'TESTTOKEN123'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()
    await flushPromises()
    vm.editForm.class_name = '小班'
    await wrapper.vm.$nextTick()

    wrapper.unmount()
    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
  })
})
