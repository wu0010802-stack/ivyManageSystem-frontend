/**
 * ActivityView 三態測試：載入中（skeleton）/ 錯誤（inline error+retry）/ 成功
 * Task 7: 補 skeleton + inline error（Bento P3）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── 可控的 mock：讓 getActivityBootstrap 可在各 test 動態設定 ──────────────
const bootstrapMock = vi.fn()

vi.mock('@/parent/api/activity', () => ({
  listCourses: vi.fn().mockResolvedValue({ data: { items: [] } }),
  myRegistrations: vi.fn().mockResolvedValue({ data: { items: [] } }),
  registerCourses: vi.fn().mockResolvedValue({ data: {} }),
  confirmPromotion: vi.fn().mockResolvedValue({ data: {} }),
  declinePromotion: vi.fn().mockResolvedValue({ data: {} }),
  getUpcomingSessions: vi.fn().mockResolvedValue({ data: { items: [] } }),
  getActivityBootstrap: (...args: unknown[]) => bootstrapMock(...args),
}))

vi.mock('@/parent/api/profile', () => ({
  getMyChildren: vi
    .fn()
    .mockResolvedValue({ data: { items: [{ student_id: 1, name: '小明' }] } }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({
    selectedId: ref(1),
    ensureSelected: vi.fn(),
  }),
}))

// 明確 mock children store，防止 FeesView.threestates 等相鄰測試檔的 vi.mock 登錄
// 在同 worker 下殘留污染本檔（ActivityView 直接呼叫 useChildrenStore()）
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

// ActivityRegisterSheet 需明確 stub（含 children prop），否則布林 stub 會撞 DOM Node.children 唯讀屬性
const ActivityRegisterSheetStub = defineComponent({
  name: 'ActivityRegisterSheet',
  props: {
    modelValue: Boolean,
    formData: Object,
    children: Array,
    courses: Array,
    myRegs: Array,
    submitting: Boolean,
    conflictCourseIds: Array,
    isRegistrationOpen: Boolean,
  },
  emits: ['update:modelValue', 'submitted'],
  template: '<div class="activity-register-sheet-stub" />',
})

// 元件 stubs：PullToRefresh 必須渲染 slot，其餘可 stub 掉
const STUBS = {
  ActivityHero: true,
  ActivityCardList: true,
  ActivityRegisterSheet: ActivityRegisterSheetStub,
  RegistrationStatusList: true,
  ChildContextHeader: true,
  ParentIcon: true,
  ConfirmDialog: true,
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
}

// 成功回應的預設值
const SUCCESS_RESP = {
  data: {
    courses: { items: [] },
    registrations: { items: [] },
    upcoming_sessions: { items: [] },
    registration_time: { is_open: true, open_at: null, close_at: null },
  },
}

beforeEach(() => {
  bootstrapMock.mockReset()
})

describe('ActivityView 三態（Task 7）', () => {
  it('載入中：coursesLoading=true 時顯示 SkeletonBlock', async () => {
    // bootstrap 永不 resolve（模擬無限 pending）
    bootstrapMock.mockReturnValue(new Promise(() => {}))

    setActivePinia(createPinia())
    const ActivityView = (await import('@/parent/views/ActivityView.vue')).default
    const w = mount(ActivityView, {
      global: { stubs: STUBS },
    })

    // onMounted 觸發 fetchBootstrap，但不 await flushPromises → promise pending → loading=true
    // 切到「可報名課程」tab（第 2 顆 tab 按鈕）
    await flushPromises() // 讓 childrenStore.load() 完成但 bootstrap 仍 pending

    // 手動切 tab（bootstrap 還在 pending，coursesLoading 仍 true）
    const tabs = w.findAll('.m3-segment')
    await tabs[1].trigger('click')

    // SkeletonBlock 應存在（coursesLoading=true 且 courses.length===0）
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)

    w.unmount()
  })

  it('fetch 失敗：顯示 MobileErrorRetry 且按「重試」會重新呼叫 bootstrap', async () => {
    // 第一次 reject，第二次 resolve（模擬重試成功）
    bootstrapMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_RESP)

    setActivePinia(createPinia())
    const ActivityView = (await import('@/parent/views/ActivityView.vue')).default
    const w = mount(ActivityView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // 切到「可報名課程」tab
    const tabs = w.findAll('.m3-segment')
    await tabs[1].trigger('click')
    await flushPromises()

    // MobileErrorRetry 應存在（loadError=true）
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    // 確認 bootstrap 已被呼叫 1 次（失敗那次）
    expect(bootstrapMock).toHaveBeenCalledTimes(1)

    // 觸發 retry 事件（點 MobileErrorRetry 內的「重試」按鈕）
    await errComp.find('button').trigger('click')
    await flushPromises()

    // bootstrap 應再被呼叫（共 2 次）
    expect(bootstrapMock).toHaveBeenCalledTimes(2)

    // 重試成功後 MobileErrorRetry 應消失（loadError=false）
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })

  it('首屏（預設「我的報名」分頁）fetch 失敗：顯示 MobileErrorRetry，不誤顯「尚無報名」', async () => {
    // 稽核 2026-06-29 finding 3：預設停在 my 分頁，首屏失敗時舊版只在 new 分頁有
    // 錯誤+重試，my 分頁卻顯示「尚無報名」空狀態 → 家長誤以為沒報名且無法重試。
    bootstrapMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_RESP)

    setActivePinia(createPinia())
    const ActivityView = (await import('@/parent/views/ActivityView.vue')).default
    const w = mount(ActivityView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // 不切 tab：預設停在「我的報名」分頁
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    // 不可誤顯「尚無報名」空狀態
    expect(w.text()).not.toContain('尚無報名')

    // 點重試 → 重新呼叫 bootstrap、成功後錯誤元件消失
    await errComp.find('button').trigger('click')
    await flushPromises()
    expect(bootstrapMock).toHaveBeenCalledTimes(2)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })

  it('成功載入後 SkeletonBlock 消失、顯示正常課程區', async () => {
    bootstrapMock.mockResolvedValue(SUCCESS_RESP)

    setActivePinia(createPinia())
    const ActivityView = (await import('@/parent/views/ActivityView.vue')).default
    const w = mount(ActivityView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    const tabs = w.findAll('.m3-segment')
    await tabs[1].trigger('click')
    await flushPromises()

    // 載入完成後 SkeletonBlock 不存在、MobileErrorRetry 不存在
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })
})
