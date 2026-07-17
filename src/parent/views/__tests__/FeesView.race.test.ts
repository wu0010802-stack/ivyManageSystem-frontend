/**
 * FeesView race guard 回歸測試（A11）
 *
 * 切換子女時，若「舊子女（慢）」的 listFeeRecords 回應晚於「新子女（快）」到達，
 * 修正前會用舊子女的費用覆蓋 records，家長看到錯誤的孩子費用。
 * 修正後 fetchRecords 以 reqId 守衛，晚到的 stale 回應被丟棄。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── selectedId 由測試 scope 控制，讓 mock 與元件共用同一個 ref ──
const selectedId = ref<number | null>(1)

// ── listFeeRecords 以 studentId 為 key 的 deferred，測試自行控制解析時序 ──
type Deferred = { resolve: (v: unknown) => void }
const deferreds = new Map<number, Deferred>()
const recordsMock = vi.fn((studentId: number) => {
  let resolveFn!: (v: unknown) => void
  const promise = new Promise((res) => {
    resolveFn = res
  })
  deferreds.set(studentId, { resolve: resolveFn })
  return promise
})

const summaryMock = vi.fn()

vi.mock('@/parent/api/fees', () => ({
  getFeesSummary: (...args: unknown[]) => summaryMock(...args),
  listFeeRecords: (studentId: number, ...rest: unknown[]) => recordsMock(studentId, ...rest),
  getFeePayments: vi.fn().mockResolvedValue({ data: { payments: [], refunds: [] } }),
}))

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [
      { student_id: 1, name: '孩子A' },
      { student_id: 2, name: '孩子B' },
    ],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({
    selectedId,
    ensureSelected: vi.fn(),
  }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// FeeListGroup 用可觀察 stub：把收到的 records 費用名稱渲染出來供斷言
const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  ChildContextHeader: true,
  DashboardHero: true,
  FeeReceiptSheet: true,
  SkeletonBlock: true,
  MobileErrorRetry: true,
  FeeListGroup: {
    props: ['records'],
    template:
      '<div class="fee-list">{{ records.map(r => r.fee_item_name).join("|") }}</div>',
  },
}

const SUCCESS_SUMMARY = {
  data: {
    totals: { outstanding: 0, overdue: 0 },
    by_student: [],
  },
}

const RECORDS_A = {
  data: {
    items: [
      { id: 1, status: 'unpaid', fee_item_name: '孩子A學費', amount_due: 1000, amount_paid: 0, outstanding: 1000, due_date: '2026-07-01' },
    ],
  },
}
const RECORDS_B = {
  data: {
    items: [
      { id: 2, status: 'paid', fee_item_name: '孩子B學費', amount_due: 2000, amount_paid: 2000, outstanding: 0, due_date: '2026-07-01' },
    ],
  },
}

beforeEach(() => {
  selectedId.value = 1
  deferreds.clear()
  recordsMock.mockClear()
  summaryMock.mockReset()
  summaryMock.mockResolvedValue(SUCCESS_SUMMARY)
})

describe('FeesView race guard（A11）', () => {
  it('切子女 A(慢)→B(快)：晚到的 A 回應不覆蓋 B 的費用', async () => {
    setActivePinia(createPinia())
    const FeesView = (await import('@/parent/views/FeesView.vue')).default
    const w = mount(FeesView, { global: { stubs: STUBS } })

    // onMounted → loadAll → fetchRecords(1) 進行中（deferred[1] pending）
    await flushPromises()
    expect(deferreds.has(1)).toBe(true)

    // 切換到孩子 B（快）→ watch 觸發 fetchRecords(2)
    selectedId.value = 2
    await flushPromises()
    expect(deferreds.has(2)).toBe(true)

    // 孩子 B（快）先回來
    deferreds.get(2)!.resolve(RECORDS_B)
    await flushPromises()
    expect(w.find('.fee-list').text()).toContain('孩子B學費')

    // 孩子 A（慢）晚到 → 應被丟棄，不得覆蓋 B
    deferreds.get(1)!.resolve(RECORDS_A)
    await flushPromises()

    const shown = w.find('.fee-list').text()
    expect(shown).toContain('孩子B學費')
    expect(shown).not.toContain('孩子A學費')

    w.unmount()
  })

  it('無競態：正常單次載入仍正確顯示當前子女費用', async () => {
    setActivePinia(createPinia())
    const FeesView = (await import('@/parent/views/FeesView.vue')).default
    const w = mount(FeesView, { global: { stubs: STUBS } })

    await flushPromises()
    expect(deferreds.has(1)).toBe(true)

    // 當前子女回應正常到達 → 正確顯示
    deferreds.get(1)!.resolve(RECORDS_A)
    await flushPromises()

    expect(w.find('.fee-list').text()).toContain('孩子A學費')

    w.unmount()
  })
})
