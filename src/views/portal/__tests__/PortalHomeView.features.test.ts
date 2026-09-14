/**
 * 首頁整併（/portal/class 併入 /portal/home）後的功能格區契約。
 *
 * 本檔承接原 PortalClassView.test.ts 的守衛：SPEC-024 的「每格一律顯示、有待辦
 * 才掛數字」與量體位抽屜的深連結行為，是隨功能搬到首頁的，不可跟著被收掉的
 * 頁面一起消失。另加首頁特有的「我的」組斷言（原「今日待辦」卡）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { ref } from 'vue'

const hubData = ref<Record<string, unknown> | null>(null)
const hubLoading = ref(false)
const hubError = ref<unknown>(null)

const { mockRefresh, mockHomeSummary, mockPickupCount, mockLeaveQuota } = vi.hoisted(
  () => ({
    mockRefresh: vi.fn(() => Promise.resolve()),
    mockHomeSummary: vi.fn(),
    mockPickupCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
    mockLeaveQuota: vi.fn(() => Promise.reject(new Error('no quota'))),
  }),
)

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

vi.mock('@/api/portalLeaveQuotaExpiry', () => ({
  getMyLeaveQuotaExpiry: mockLeaveQuota,
}))

vi.mock('@/api/portalMeasurements', () => ({
  getMeasurementsLatest: vi.fn(() => Promise.resolve({ data: [] })),
}))

// 權限過濾本身由 portalClassFeatures.test.ts 守，這裡固定放行以聚焦版面行為。
vi.mock('@/utils/auth', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, hasPortalPermission: vi.fn(() => true) }
})

import PortalHomeView from '@/views/portal/PortalHomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

const STUBS = {
  PortalBatchMeasurementSheet: {
    // 抽屜走 v-model（modelValue: boolean）。data-show 明確 String() 轉字串——
    // Vue 3 對 :attr="false" 會直接移除屬性，不轉會拿到 undefined。
    props: ['modelValue'],
    template: '<div class="measurement-sheet-stub" :data-show="String(modelValue)" />',
  },
  TodayFocusCard: true,
  ClassroomOpsCard: true,
}

const SUMMARY = {
  me: { name: '老師' },
  today: { date: '2026-09-14', shift: null, attendance: {} },
  classrooms: [] as unknown[],
  actions: {
    pending_substitute: 2,
    pending_swap: 1,
    pending_anomaly_confirms: 5,
    pending_anomaly_earliest: { year: 2026, month: 7 },
    unread_announcements: 3,
  },
}

async function mountView() {
  const wrapper = mount(PortalHomeView, {
    global: { plugins: [ElementPlus, createPinia(), router], stubs: STUBS },
  })
  await flushPromises()
  return wrapper
}

describe('PortalHomeView 功能格區（/portal/class 整併後）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
    mockRefresh.mockClear()
    mockHomeSummary.mockReset()
    mockHomeSummary.mockResolvedValue({ data: { ...SUMMARY } })
    mockLeaveQuota.mockClear()
    mockLeaveQuota.mockRejectedValue(new Error('no quota'))
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('渲染班名與教學／管理／我的三組', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('向日葵班')
    expect(wrapper.text()).toContain('教學')
    expect(wrapper.text()).toContain('管理')
    expect(wrapper.text()).toContain('我的')
  })

  it('今天沒待辦的功能入口仍然顯示（SPEC-024 的重點，隨功能搬家）', async () => {
    hubData.value = { classroom_id: 3, classroom_name: '向日葵班', counts: {} }
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="feature-albums"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="feature-measurement"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="feature-work-samples"]').exists()).toBe(true)
  })

  it('有待辦的格子掛數字，沒待辦的不掛', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="feature-student-attendance"]').text()).toContain('3')
    expect(
      wrapper.find('[data-test="feature-observations"]').find('.feature-badge').exists(),
    ).toBe(false)
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
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-albums"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/albums')
  })

  /**
   * 整併前「我的班級」卡對每張班級卡都帶了 ?classroom_id=，多班老師靠它從第二張
   * 卡進第二班的聯絡簿／點名。那批 KPI 被功能格取代後，若功能格不帶班級，切了班
   * 再點進去會落回目的頁的第一班——誤寫聯絡簿、誤點名。
   *
   * 只有真的會讀這個 query 的四頁才帶（見 utils/portalQuery.pickClassroomIdFromQuery
   * 的消費端）：學生點名、每日聯絡簿、課堂觀察、班級學生。
   */
  it.each([
    ['student-attendance', '/portal/student-attendance'],
    ['contact-book', '/portal/contact-book'],
    ['observations', '/portal/observations'],
    ['students', '/portal/students'],
  ])('吃 classroom_id 的 %s 要帶上當前班級', async (key, path) => {
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const wrapper = await mountView()
    await wrapper.find(`[data-test="feature-${key}"]`).trigger('click')
    expect(push).toHaveBeenCalledWith({ path, query: { classroom_id: 3 } })
  })

  it('不讀 classroom_id 的目的頁維持純路徑，不塞無用的 query', async () => {
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-incidents"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/incidents')
  })

  it('沒有班級（未綁班／403）時不帶空的 classroom_id', async () => {
    hubData.value = null
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-contact-book"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/contact-book')
  })

  it('點量體位格開抽屜、不跳頁', async () => {
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-measurement"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.measurement-sheet-stub').attributes('data-show')).toBe('true')
    expect(push).not.toHaveBeenCalled()
  })

  // ===== 「我的」組：原「今日待辦」卡的四項 =====

  it('「我的」組四格的數字取自 dashboard actions', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="feature-pending-substitute"]').text()).toContain('2')
    expect(wrapper.find('[data-test="feature-pending-swap"]').text()).toContain('1')
    expect(wrapper.find('[data-test="feature-anomalies"]').text()).toContain('5')
    expect(wrapper.find('[data-test="feature-announcements"]').text()).toContain('3')
  })

  it('異常待確認帶最早待確認月份，否則舊異常永遠找不到、badge 也消不掉', async () => {
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-anomalies"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/anomalies?year=2026&month=7')
  })

  it('沒有最早待確認月份時退回不帶 query 的異常頁', async () => {
    mockHomeSummary.mockResolvedValue({
      data: { ...SUMMARY, actions: { ...SUMMARY.actions, pending_anomaly_earliest: null } },
    })
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const wrapper = await mountView()
    await wrapper.find('[data-test="feature-anomalies"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/anomalies')
  })

  it('成長軌跡與活動調查有入口——側欄沒有它們，刪掉快速進入而不接住就進不去了', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="feature-growth"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="feature-surveys"]').exists()).toBe(true)
  })

  it('首頁不再保留「快速進入」與「今日待辦」兩張卡（同一功能只有一個入口）', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('快速進入')
    expect(wrapper.text()).not.toContain('今日待辦')
  })

  // ===== 班級切換（自 /portal/class 搬來）=====

  it('單班教師不顯示班級切換器', async () => {
    mockHomeSummary.mockResolvedValue({
      data: { ...SUMMARY, classrooms: [{ classroom_id: 3, classroom_name: '向日葵班' }] },
    })
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="classroom-switch"]').exists()).toBe(false)
  })

  it('多班教師顯示班級切換器', async () => {
    mockHomeSummary.mockResolvedValue({
      data: {
        ...SUMMARY,
        classrooms: [
          { classroom_id: 3, classroom_name: '向日葵班' },
          { classroom_id: 5, classroom_name: '天堂鳥班' },
        ],
      },
    })
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="classroom-switch"]').exists()).toBe(true)
  })
})
