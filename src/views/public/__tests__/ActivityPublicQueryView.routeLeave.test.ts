import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const publicQueryByToken = vi.fn()
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: (...args: unknown[]) => publicQueryByToken(...args),
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
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: { '美術': 5 } }),
}))

import ActivityPublicQueryView from '../ActivityPublicQueryView.vue'

const NextPage = defineComponent({ template: '<div>next page</div>' })
const RouterHost = defineComponent({ setup: () => () => h(RouterView) })

describe('ActivityPublicQueryView SPA route-leave 草稿保護', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicQueryByToken.mockResolvedValue({
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
    })
  })

  it('編輯後用 memory history 離開，取消確認時應留在原頁', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/public/activity/query', component: ActivityPublicQueryView },
        { path: '/next', component: NextPage },
      ],
    })
    await router.push('/public/activity/query')
    await router.isReady()
    const wrapper = mount(RouterHost, {
      global: { plugins: [router], stubs: { teleport: true } },
    })
    await flushPromises()

    const view = wrapper.findComponent(ActivityPublicQueryView)
    const vm = view.vm as unknown as {
      queryForm: { token: string; parent_phone: string }
      editForm: { class_name: string }
      handleQuery: () => Promise<void>
    }
    vm.queryForm.token = 'TESTTOKEN123'
    vm.queryForm.parent_phone = '0912345678'
    await vm.handleQuery()
    await flushPromises()
    vm.editForm.class_name = '小班'
    await view.vm.$nextTick()

    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    await router.push('/next')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/public/activity/query')
    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
