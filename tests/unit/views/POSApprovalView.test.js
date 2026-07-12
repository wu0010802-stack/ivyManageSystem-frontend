/**
 * POSApprovalView — 日結簽核表單回歸
 *
 * Finding #3（2026-06-24 code review）：切換 selectedDate 時表單不清空，
 * 主管在 A 日輸入的盤點金額 / 備註會串到 B 日送出，污染日結 snapshot 的
 * actual_cash_count / cash_variance / note。修法：watch(selectedDate) 立即
 * resetForm()，並在 detail 載入完成前停用簽核按鈕。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { getPOSDailyCloseStatus } from '@/api/activity'

function makeDeferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/activity', () => ({
  approvePOSDailyClose: vi.fn(() => Promise.resolve({ data: { warnings: [] } })),
  getPOSDailyClosePending: vi.fn(() => Promise.resolve({ data: { pending: [] } })),
  getPOSDailyCloseStatus: vi.fn(() =>
    Promise.resolve({ data: { status: 'pending', by_method: {} } }),
  ),
  getPOSReconciliation: vi.fn(() => Promise.resolve({ data: { items: [], totals: {} } })),
  getPOSRecentTransactions: vi.fn(() => Promise.resolve({ data: { transactions: [] } })),
  unlockPOSDailyClose: vi.fn(() => Promise.resolve({ data: {} })),
}))

// ── auth mock：給簽核權限 ───────────────────────────────────────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
  getUserInfo: vi.fn(() => ({ username: 'boss', role: 'admin' })),
}))

// ── element-plus 訊息 mock ─────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()), alert: vi.fn() },
}))

import POSApprovalView from '@/views/activity/POSApprovalView.vue'

const GLOBAL_STUBS = {
  PageHeader: true,
  POSSemesterReconciliation: true,
  StatCard: true,
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-date-picker': { template: '<input />' },
  // 不渲染 table scoped slot：row 為 undefined 會在 row.items / row.status 崩潰，
  // 而本測試只讀 setupState，不需要 table 內容
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<div />' },
  'el-alert': { template: '<div />' },
  'el-icon': { template: '<span />' },
  'el-empty': { template: '<div />' },
}

function mountView() {
  return mount(POSApprovalView, {
    global: {
      stubs: GLOBAL_STUBS,
      mocks: { $router: { push: vi.fn() } },
    },
  })
}

describe('POSApprovalView — 日結表單', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('切換 selectedDate 會清空表單，避免盤點金額/備註串到下一天', async () => {
    const wrapper = mountView()
    await flushPromises()
    const state = wrapper.vm.$.setupState

    // 主管在當前日期輸入了盤點金額與備註
    state.form.actualCashCount = 8888
    state.form.note = '前一天的備註'

    // 切換到另一個日期
    state.selectedDate = '2026-06-20'
    await nextTick()
    await flushPromises()

    expect(state.form.actualCashCount).toBe(null)
    expect(state.form.note).toBe('')
  })

  it('切日期後舊日 detail 慢回應不得覆蓋新日資料（亂序回應守衛）', async () => {
    // A 日（2026-06-20）回應「卡住」、B 日（2026-06-21）快速回應，
    // 隨後 A 日的慢回應才姍姍來遲——過時回應不得覆蓋 B 日 detail / cashInSystem，
    // 否則主管看 A 日現金卻簽核 B 日。
    const deferredA = makeDeferred()
    getPOSDailyCloseStatus.mockImplementation((date) => {
      if (date === '2026-06-20') return deferredA.promise
      if (date === '2026-06-21')
        return Promise.resolve({
          data: { status: 'pending', by_method: { 現金: 999 }, _marker: 'B' },
        })
      return Promise.resolve({ data: { status: 'pending', by_method: {} } })
    })

    const wrapper = mountView()
    await flushPromises()
    const state = wrapper.vm.$.setupState

    // 切到 A 日：detail 請求在途（卡住）
    state.selectedDate = '2026-06-20'
    await nextTick()

    // 立刻切到 B 日：B 快速回應完成
    state.selectedDate = '2026-06-21'
    await nextTick()
    await flushPromises()
    expect(state.detail?._marker).toBe('B')

    // A 日慢回應此刻才回來
    deferredA.resolve({
      data: { status: 'pending', by_method: { 現金: 111 }, _marker: 'A' },
    })
    await flushPromises()

    // 守衛應丟棄過時的 A 回應，detail / cashInSystem 仍為 B 日
    expect(state.detail?._marker).toBe('B')
    expect(state.cashInSystem).toBe(999)
  })

  it('detail 載入中時停用簽核按鈕，避免用舊 context 簽核', async () => {
    const wrapper = mountView()
    await flushPromises()
    const state = wrapper.vm.$.setupState

    // 閒置且有權限 → 可簽核
    expect(state.approveDisabled).toBe(false)

    // detail 載入中 → 停用
    state.loadingDetail = true
    await nextTick()
    expect(state.approveDisabled).toBe(true)
  })
})
