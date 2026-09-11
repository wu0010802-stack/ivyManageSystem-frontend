import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { ref } from 'vue'

const hubData = ref<Record<string, unknown> | null>(null)
const hubLoading = ref(false)
const hubError = ref<unknown>(null)

const { mockRefresh, mockPush, mockRouteQuery, mockHomeSummary, mockPickupCount } =
  vi.hoisted(() => ({
    mockRefresh: vi.fn(() => Promise.resolve()),
    mockPush: vi.fn(),
    mockRouteQuery: { value: {} as Record<string, unknown> },
    mockHomeSummary: vi.fn(() =>
      Promise.resolve({ data: { classrooms: [] as unknown[] } }),
    ),
    mockPickupCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
  }))

vi.mock('@/composables/usePortalClassHub', () => ({
  usePortalClassHub: () => ({
    data: hubData,
    loading: hubLoading,
    error: hubError,
    refresh: mockRefresh,
    decrementCount: vi.fn(),
  }),
}))

vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({ pendingCount: ref(4) }),
}))

vi.mock('@/api/portal', () => ({
  getPortalPickupPendingCount: mockPickupCount,
}))

vi.mock('@/api/portalHome', () => ({
  getHomeSummary: mockHomeSummary,
}))

vi.mock('@/api/portalMeasurements', () => ({
  getMeasurementsLatest: vi.fn(() => Promise.resolve({ data: [] })),
}))

vi.mock('@/utils/auth', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, hasPortalPermission: vi.fn(() => true) }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockRouteQuery.value }),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

import PortalClassView from '@/views/portal/PortalClassView.vue'

const STUBS = {
  PortalBatchMeasurementSheet: {
    // 抽屜走 v-model（modelValue: boolean）。data-show 明確 String() 轉字串——
    // Vue 3 對 :attr="false" 會直接移除屬性，不轉會拿到 undefined。
    props: ['modelValue'],
    template: '<div class="measurement-sheet-stub" :data-show="String(modelValue)" />',
  },
  // 頁首與錯誤狀態**不可用 auto-stub（`true`）**：auto-stub 既不渲染 prop 也不渲染
  // slot，會讓三題斷言落空（班名、班級切換器、錯誤訊息），其中「單班不顯示切換器」
  // 那題還會假綠——auto-stub 下本來就找不到那個 data-test。
  PortalPageHeader: {
    props: ['title', 'subtitle'],
    template:
      '<div class="page-header-stub">{{ title }} {{ subtitle }}<slot name="actions" /></div>',
  },
  PortalErrorState: {
    props: ['message'],
    template: '<div class="error-state-stub">{{ message }}</div>',
  },
}

async function mountView() {
  const wrapper = mount(PortalClassView, {
    global: { plugins: [ElementPlus, createPinia()], stubs: STUBS },
  })
  await flushPromises()
  return wrapper
}

describe('PortalClassView', () => {
  beforeEach(() => {
    hubData.value = {
      classroom_id: 3,
      classroom_name: '向日葵班',
      counts: {
        attendance_pending: 3,
        contact_books_pending: 1,
        observations_pending: 0,
        medications_pending: 0,
        incidents_today: 7,
      },
    }
    hubLoading.value = false
    hubError.value = null
    mockRouteQuery.value = {}
    mockPush.mockClear()
    mockRefresh.mockClear()
    mockHomeSummary.mockResolvedValue({ data: { classrooms: [] } })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('渲染班名與兩組功能格', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('向日葵班')
    expect(wrapper.text()).toContain('教學')
    expect(wrapper.text()).toContain('管理')
  })

  it('今天沒待辦的功能入口仍然顯示（這是本次改版的重點）', async () => {
    hubData.value = { classroom_id: 3, classroom_name: '向日葵班', counts: {} }
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="feature-albums"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="feature-measurement"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="feature-work-samples"]').exists()).toBe(true)
  })

  it('有待辦的格子掛數字，沒待辦的不掛', async () => {
    const wrapper = await mountView()
    const attendance = wrapper.find('[data-test="feature-student-attendance"]')
    expect(attendance.text()).toContain('3')
    const observations = wrapper.find('[data-test="feature-observations"]')
    expect(observations.find('.feature-badge').exists()).toBe(false)
  })

  it('事件紀錄不因 incidents_today 掛 badge', async () => {
    const wrapper = await mountView()
    const incidents = wrapper.find('[data-test="feature-incidents"]')
    expect(incidents.exists()).toBe(true)
    expect(incidents.find('.feature-badge').exists()).toBe(false)
    expect(incidents.text()).not.toContain('7')
  })

  it('接送通知的數字來自 dismissal alerts singleton', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="feature-dismissal-calls"]').text()).toContain('4')
  })

  it('點功能格跳到對應路由', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-contact-book"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/portal/contact-book')
  })

  it('點量體位格開抽屜、不跳頁', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-measurement"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.measurement-sheet-stub').attributes('data-show')).toBe('true')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('?sheet=measurement 進頁即開抽屜', async () => {
    mockRouteQuery.value = { sheet: 'measurement' }
    const wrapper = await mountView()
    expect(wrapper.find('.measurement-sheet-stub').attributes('data-show')).toBe('true')
  })

  it('單班教師不顯示班級切換器', async () => {
    mockHomeSummary.mockResolvedValue({
      data: { classrooms: [{ classroom_id: 3, classroom_name: '向日葵班' }] },
    })
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="classroom-switch"]').exists()).toBe(false)
  })

  it('多班教師顯示班級切換器', async () => {
    mockHomeSummary.mockResolvedValue({
      data: {
        classrooms: [
          { classroom_id: 3, classroom_name: '向日葵班' },
          { classroom_id: 5, classroom_name: '天堂鳥班' },
        ],
      },
    })
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="classroom-switch"]').exists()).toBe(true)
  })

  it('載入失敗顯示錯誤，不得偽裝成「沒有功能」', async () => {
    hubData.value = null
    hubError.value = new Error('network down')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('載入失敗')
  })
})
