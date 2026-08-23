import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { ref } from 'vue'

/**
 * PortalClassHubView（今日班級工作台）smoke 測試（2026-08-24 補零覆蓋）。
 *
 * 這是教師端流量最大的頁面，之前完全沒有 view 層測試。本檔鎖三件事：
 * 1. error 與 empty 必須分辨（載入失敗誤顯示成「今天沒有任務」是安全隱患，
 *    view 內註解明文要求）
 * 2. 正常資料渲染班名與時段卡
 * 3. deep link ?sheet=… 進頁即開對應抽屜（sticky next 的既有回歸點）
 */

const hubData = ref<Record<string, unknown> | null>(null)
const hubLoading = ref(false)
const hubError = ref<unknown>(null)
const { mockRefresh, mockDecrement, mockPush, mockRouteQuery } = vi.hoisted(() => ({
  mockRefresh: vi.fn(() => Promise.resolve()),
  mockDecrement: vi.fn(),
  mockPush: vi.fn(),
  mockRouteQuery: { value: {} as Record<string, unknown> },
}))

vi.mock('@/composables/usePortalClassHub', () => ({
  usePortalClassHub: () => ({
    data: hubData,
    loading: hubLoading,
    error: hubError,
    refresh: mockRefresh,
    decrementCount: mockDecrement,
  }),
}))

vi.mock('@/composables/useClassHubPanelQuery', () => ({
  useClassHubPanelQuery: () => ({
    panel: ref(null),
    threadId: ref(null),
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    openThread: vi.fn(),
    closeThread: vi.fn(),
  }),
}))

// canMessages=false：本 smoke 不涉家園溝通 drawer，也讓 store.refreshUnread 短路
vi.mock('@/utils/auth', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, hasPortalPermission: vi.fn(() => false) }
})

vi.mock('@/api/portalMeasurements', () => ({
  getMeasurementsLatest: vi.fn(() => Promise.resolve({ data: [] })),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockRouteQuery.value }),
  useRouter: () => ({ push: mockPush }),
}))

import PortalClassHubView from '@/views/portal/PortalClassHubView.vue'

const CHILD_STUBS = {
  ClassHubCommBar: true,
  ClassHubStickyNext: true,
  ClassHubTimeSlotCard: {
    props: ['slot', 'isCurrent'],
    template: '<div class="slot-card-stub" />',
  },
  ClassHubAttendanceSheet: {
    props: ['show'],
    template: '<div class="attendance-sheet-stub" :data-show="show" />',
  },
  ClassHubMedicationSheet: {
    props: ['show'],
    template: '<div class="medication-sheet-stub" :data-show="show" />',
  },
  ClassHubIncidentQuickSheet: true,
  ClassHubMessagesDrawer: true,
  ClassHubBatchMeasurementCard: true,
  ClassHubLeaveCard: true,
  PortalBatchMeasurementSheet: true,
}

async function mountView() {
  const wrapper = mount(PortalClassHubView, {
    global: {
      plugins: [ElementPlus, createPinia()],
      stubs: CHILD_STUBS,
    },
  })
  await flushPromises()
  return wrapper
}

describe('PortalClassHubView smoke', () => {
  beforeEach(() => {
    hubData.value = null
    hubLoading.value = false
    hubError.value = null
    mockRefresh.mockClear()
    mockPush.mockClear()
    mockRouteQuery.value = {}
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('載入失敗顯示 error state（不得偽裝成「今天沒有任務」）', async () => {
    hubError.value = new Error('network down')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('工作台載入失敗')
    expect(wrapper.text()).not.toContain('目前沒有班級任務')
  })

  it('classroom_id=0 顯示空狀態而非 error', async () => {
    hubData.value = { classroom_id: 0 }
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('目前沒有班級任務')
    expect(wrapper.text()).not.toContain('工作台載入失敗')
  })

  it('正常資料渲染班名與各時段卡', async () => {
    hubData.value = {
      classroom_id: 3,
      classroom_name: '向日葵班',
      fetched_at: new Date().toISOString(),
      sticky_next: null,
      slots: [
        { slot_id: 'morning', tasks: [] },
        { slot_id: 'noon', tasks: [] },
      ],
    }
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('向日葵班')
    expect(wrapper.findAll('.slot-card-stub')).toHaveLength(2)
  })

  it('手動刷新按鈕觸發 refresh', async () => {
    hubData.value = { classroom_id: 3, classroom_name: '向日葵班', slots: [] }
    const wrapper = await mountView()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('手動刷新'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('deep link ?sheet=medication 進頁即開用藥抽屜', async () => {
    hubData.value = { classroom_id: 3, classroom_name: '向日葵班', slots: [] }
    mockRouteQuery.value = { sheet: 'medication' }
    const wrapper = await mountView()
    expect(wrapper.find('.medication-sheet-stub').attributes('data-show')).toBe('true')
    expect(wrapper.find('.attendance-sheet-stub').attributes('data-show')).toBe('false')
  })
})
