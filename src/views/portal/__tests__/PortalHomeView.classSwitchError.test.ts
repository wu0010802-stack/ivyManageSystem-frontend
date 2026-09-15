/**
 * 切班失敗的使用者提示（2026-09-14 審查 P1）。
 *
 * usePortalClassHub 本身已修好競態與「切班失敗清空舊資料」；本檔守的是
 * 上一層 view 不能讓這個失敗完全靜默——老師點了下拉選單卻什麼都沒發生，
 * 會以為自己點錯或系統沒反應，而不是「這次切換失敗了」。
 *
 * 首次載入（沒帶班的行政同仁預設拿 403）刻意維持靜默，不在本檔測試範圍——
 * 那是既有設計，見 PortalHomeView.vue 對 `hub` computed 的註解。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { ref } from 'vue'

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

const hubData = ref<Record<string, unknown> | null>({
  classroom_id: 3,
  classroom_name: '向日葵班',
  counts: {},
})
const hubError = ref<unknown>(null)
const mockRefresh = vi.fn()

const { mockHomeSummary, mockPickupCount, mockLeaveQuota } = vi.hoisted(() => ({
  mockHomeSummary: vi.fn(),
  mockPickupCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
  mockLeaveQuota: vi.fn(() => Promise.reject(new Error('no quota'))),
}))

vi.mock('@/composables/usePortalClassHub', () => ({
  usePortalClassHub: () => ({
    data: hubData,
    loading: ref(false),
    error: hubError,
    refresh: mockRefresh,
    decrementCount: vi.fn(),
  }),
}))

vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({ pendingCount: ref(0) }),
}))

vi.mock('@/api/portal', () => ({ getPortalPickupPendingCount: mockPickupCount }))
vi.mock('@/api/portalHome', () => ({ getHomeSummary: mockHomeSummary }))
vi.mock('@/api/portalLeaveQuotaExpiry', () => ({ getMyLeaveQuotaExpiry: mockLeaveQuota }))
vi.mock('@/api/portalMeasurements', () => ({
  getMeasurementsLatest: vi.fn(() => Promise.resolve({ data: [] })),
}))
vi.mock('@/utils/auth', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, hasPortalPermission: vi.fn(() => true) }
})

import PortalHomeView from '@/views/portal/PortalHomeView.vue'
import { ElMessage } from 'element-plus'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

const SUMMARY = {
  me: { name: '老師' },
  today: { date: '2026-09-14', shift: null, attendance: {} },
  classrooms: [
    { classroom_id: 3, classroom_name: '向日葵班' },
    { classroom_id: 5, classroom_name: '天堂鳥班' },
  ],
  actions: {},
}

async function mountView() {
  mockHomeSummary.mockResolvedValue({ data: SUMMARY })
  const wrapper = mount(PortalHomeView, {
    global: {
      plugins: [ElementPlus, createPinia(), router],
      stubs: { TodayFocusCard: true, ClassroomOpsCard: true, PortalBatchMeasurementSheet: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('PortalHomeView 切班失敗提示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hubData.value = { classroom_id: 3, classroom_name: '向日葵班', counts: {} }
    hubError.value = null
    mockRefresh.mockResolvedValue(undefined)
  })

  it('切班失敗時提示使用者，不完全靜默', async () => {
    const wrapper = await mountView()

    mockRefresh.mockImplementationOnce(() => {
      hubData.value = null
      hubError.value = new Error('403')
      return Promise.reject(hubError.value)
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    await select.vm.$emit('change', 5)
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('切換班級失敗，請重新選擇或稍後再試')
  })

  it('切班成功時不誤發失敗提示', async () => {
    const wrapper = await mountView()

    mockRefresh.mockImplementationOnce(() => {
      hubData.value = { classroom_id: 5, classroom_name: '天堂鳥班', counts: {} }
      return Promise.resolve(hubData.value)
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    await select.vm.$emit('change', 5)
    await flushPromises()

    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('成功切班後，之後背景輪詢失敗不會誤觸發「切換班級失敗」提示', async () => {
    // switchAttempted 旗標必須在成功後歸位，否則之後任何失敗（含與切班
    // 無關的背景輪詢）都會誤報成切班失敗。
    const wrapper = await mountView()

    mockRefresh.mockImplementationOnce(() => {
      hubData.value = { classroom_id: 5, classroom_name: '天堂鳥班', counts: {} }
      return Promise.resolve(hubData.value)
    })
    const select = wrapper.findComponent({ name: 'ElSelect' })
    await select.vm.$emit('change', 5)
    await flushPromises()
    expect(ElMessage.error).not.toHaveBeenCalled()

    // 之後一次無關的失敗（例如輪詢），不應該被當成切班失敗提示。
    hubError.value = new Error('poll failed')
    await flushPromises()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
