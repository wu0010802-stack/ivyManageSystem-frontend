/**
 * AdminListView 三態測試（F5）。
 *
 * 修前：AdminListView.vue 只解構 `useHomeSummary()` 的 `badges`/`summary`，
 * 丟棄 `error`/`pending`；`/parent/home/summary` 失敗時 `num()` 把每個欄位
 * fallback 成 0，7 個徽章會靜默顯示「一切都處理完了」，家長可能誤以為沒有
 * 待辦（含逾期款項）。比照 TodayView 的錯誤態處理：pending 時顯示
 * SkeletonBlock，error 時顯示 MobileErrorRetry + 重試，避免誤導性的 0。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const dataRef = ref<Record<string, unknown> | null>(null)
const errorRef = ref<unknown>(null)
const pendingRef = ref(false)
const refreshMock = vi.fn()

vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({
    data: dataRef,
    error: errorRef,
    pending: pendingRef,
    refresh: refreshMock,
  }),
}))

vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/api/pickup', () => ({
  listPickupAuthorizations: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

import AdminListView from '@/parent/views/AdminListView.vue'

const SUCCESS_DATA = {
  summary: {
    unread_announcements: 0,
    unread_messages: 0,
    fees: { outstanding_count: 3, overdue: 1200 },
    pending_event_acks: 0,
    pending_activity_promotions: 0,
    recent_leave_reviews: 0,
    active_medication_orders: 0,
  },
}

beforeEach(() => {
  dataRef.value = null
  errorRef.value = null
  pendingRef.value = false
  refreshMock.mockReset()
})

describe('AdminListView 三態（F5）', () => {
  it('pending 且尚無資料時顯示 SkeletonBlock，不渲染事務清單（不出現誤導性的 0）', () => {
    pendingRef.value = true
    const w = mount(AdminListView)

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.findAll('li').length).toBe(0)
    w.unmount()
  })

  it('error 且尚無資料時顯示 MobileErrorRetry（不再靜默顯示 0），按重試會呼叫 refresh', async () => {
    errorRef.value = { displayMessage: '網路錯誤' }
    const w = mount(AdminListView)

    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    // 逾期款項這類需要提醒的項目在錯誤態下不可被誤讀為「沒有待辦」
    expect(w.findAll('.admin-badge').length).toBe(0)
    expect(w.findAll('li').length).toBe(0)

    await errComp.find('button').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('已有資料時即使背景 refresh 又 pending/error，清單仍持續顯示（不因背景重整而消失）', () => {
    dataRef.value = SUCCESS_DATA
    pendingRef.value = true
    const w = mount(AdminListView)

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    const badge = w.findAll('li').find((li) => li.text().includes('繳費'))?.find('.admin-badge')
    expect(badge?.text()).toBe('3')
    w.unmount()
  })

  it('成功載入後正常渲染徽章，無 Skeleton/MobileErrorRetry', () => {
    dataRef.value = SUCCESS_DATA
    const w = mount(AdminListView)

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.findAll('li').length).toBeGreaterThan(0)
    w.unmount()
  })
})
