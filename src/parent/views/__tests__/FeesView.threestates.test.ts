/**
 * FeesView 三態測試：載入中（skeleton）/ 錯誤（inline error+retry）/ 成功
 * Task 9: 繳費頁 DashboardHero + StatusPill + error 三態（Bento P3）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── 可控的 mock：讓 getFeesSummary / listFeeRecords 可在各 test 動態設定 ──
const summaryMock = vi.fn()
const recordsMock = vi.fn()

vi.mock('@/parent/api/fees', () => ({
  getFeesSummary: (...args: unknown[]) => summaryMock(...args),
  listFeeRecords: (...args: unknown[]) => recordsMock(...args),
  getFeePayments: vi.fn().mockResolvedValue({ data: { payments: [], refunds: [] } }),
}))

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({
    selectedId: ref(1),
    ensureSelected: vi.fn(),
  }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// 元件 stubs：PullToRefresh 必須渲染 slot；其餘 heavy 元件 stub 掉
const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  FeeHero: true,
  FeeListGroup: true,
  FeeReceiptSheet: true,
  ChildContextHeader: true,
  LaurelWreath: true,
  StatusPill: true,
}

// 成功回應的預設值
const SUCCESS_SUMMARY = {
  data: {
    totals: { outstanding: 3000, overdue: 0 },
    by_student: [{ student_id: 1, outstanding: 3000, amount_paid: 0 }],
  },
}
const SUCCESS_RECORDS = {
  data: { items: [{ id: 1, status: 'unpaid', fee_item_name: '學費', amount_due: 3000, amount_paid: 0, outstanding: 3000, due_date: '2026-07-01' }] },
}

beforeEach(() => {
  summaryMock.mockReset()
  recordsMock.mockReset()
})

describe('FeesView 三態（Task 9）', () => {
  it('載入中：loading=true 且 records 為空時顯示 SkeletonBlock', async () => {
    // summary 立刻成功；records 永不 resolve（模擬無限 pending）
    summaryMock.mockResolvedValue(SUCCESS_SUMMARY)
    recordsMock.mockReturnValue(new Promise(() => {}))

    setActivePinia(createPinia())
    const FeesView = (await import('@/parent/views/FeesView.vue')).default
    const w = mount(FeesView, {
      global: { stubs: STUBS },
    })

    // onMounted 觸發 fetch，但 records 仍 pending → loading=true, records.length===0
    // 讓 summary 先完成，records 仍 pending
    await flushPromises()

    // SkeletonBlock 應存在（loading=true 且 records.length===0）
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)

    w.unmount()
  })

  it('fetch 失敗：顯示 MobileErrorRetry 且按「重試」會重新呼叫 fetch', async () => {
    // 兩個 API 第一次都 reject，第二次都 resolve（模擬重試成功）
    summaryMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_SUMMARY)
    recordsMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_RECORDS)

    setActivePinia(createPinia())
    const FeesView = (await import('@/parent/views/FeesView.vue')).default
    const w = mount(FeesView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // MobileErrorRetry 應存在（loadError=true, records.length===0）
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    // 確認 records 被呼叫 1 次（失敗那次）
    expect(recordsMock).toHaveBeenCalledTimes(1)

    // 觸發 retry 事件（MobileErrorRetry 內的「重試」按鈕）
    await errComp.find('button').trigger('click')
    await flushPromises()

    // records 應再被呼叫（共 2 次）
    expect(recordsMock).toHaveBeenCalledTimes(2)

    // 重試成功後 MobileErrorRetry 應消失（loadError=false）
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })

  it('pull-to-refresh 失敗時 loadError 為 true 且 MobileErrorRetry 出現（records 為空時）', async () => {
    // 初始載入失敗（records 為空），接著 pull-to-refresh 也失敗
    // 修正前：pullRefresh 重置 loadError=false 後 reject 未被 catch → MobileErrorRetry 消失
    // 修正後：pullRefresh catch 住後再設 loadError=true → MobileErrorRetry 持續顯示
    summaryMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })   // 初始載入失敗
      .mockRejectedValueOnce({ displayMessage: '重整失敗' })   // pull-to-refresh 也失敗
    recordsMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })   // 初始載入失敗
      .mockRejectedValueOnce({ displayMessage: '重整失敗' })   // pull-to-refresh 也失敗

    setActivePinia(createPinia())
    const FeesView = (await import('@/parent/views/FeesView.vue')).default
    const w = mount(FeesView, {
      global: { stubs: STUBS },
    })
    // 讓初始載入完成（失敗）
    await flushPromises()

    // 初始失敗後 MobileErrorRetry 應出現（loadError=true, records.length===0）
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(true)

    // 觸發 pullRefresh：透過 defineExpose 暴露的函式直接呼叫
    await (w.vm as unknown as { pullRefresh: () => Promise<void> }).pullRefresh()
    await flushPromises()

    // pull-to-refresh 也失敗後 loadError 仍應為 true → MobileErrorRetry 應持續出現
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    w.unmount()
  })

  it('成功載入後 SkeletonBlock 消失、MobileErrorRetry 不存在', async () => {
    summaryMock.mockResolvedValue(SUCCESS_SUMMARY)
    recordsMock.mockResolvedValue(SUCCESS_RECORDS)

    setActivePinia(createPinia())
    const FeesView = (await import('@/parent/views/FeesView.vue')).default
    const w = mount(FeesView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // 成功後 SkeletonBlock 與 MobileErrorRetry 皆不存在
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })
})
