/**
 * FeesView 摘要口徑：hero 的金額、標題、狀態一律用目前孩子的數字；拿不到才退回全家並標明。
 * 先前金額是全家合計、標題卻依目前孩子判斷，會同時出現「繳費無欠款」與「NT$ 5,000」，
 * 而且 eyebrow 寫「本月應繳」但其實是全部未繳。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const summaryMock = vi.fn()
const recordsMock = vi.fn()

vi.mock('@/parent/api/fees', () => ({
  getFeesSummary: (...args: unknown[]) => summaryMock(...args),
  listFeeRecords: (...args: unknown[]) => recordsMock(...args),
  getFeePayments: vi.fn().mockResolvedValue({ data: { payments: [], refunds: [] } }),
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }, { student_id: 2, name: '小美' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  FeeListGroup: true,
  FeeReceiptSheet: true,
  ChildContextHeader: true,
}

async function mountView() {
  setActivePinia(createPinia())
  const FeesView = (await import('@/parent/views/FeesView.vue')).default
  const w = mount(FeesView, { global: { stubs: STUBS } })
  await flushPromises()
  return w
}

const paid = { id: 1, status: 'paid', fee_item_name: '學費', amount_due: 3000, amount_paid: 3000, outstanding: 0, due_date: '2026-09-01' }

beforeEach(() => {
  summaryMock.mockReset()
  recordsMock.mockReset()
})

describe('FeesView hero 口徑', () => {
  it('目前孩子已繳清、其他孩子有欠款：標題與金額都說這位孩子無欠款，另註明全家合計', async () => {
    summaryMock.mockResolvedValue({
      data: {
        totals: { outstanding: 5000, overdue: 0 },
        by_student: [
          { student_id: 1, outstanding: 0, amount_paid: 3000 },
          { student_id: 2, outstanding: 5000, amount_paid: 0 },
        ],
      },
    })
    recordsMock.mockResolvedValue({ data: { items: [paid] } })
    const w = await mountView()

    expect(w.find('.dash-hero-eyebrow').text()).toBe('小明・未繳合計')
    expect(w.find('.dash-hero-title').text()).toBe('繳費無欠款')
    expect(w.find('.dash-hero-value').text()).toBe('NT$ 0')
    expect(w.text()).not.toContain('本月應繳')
    expect(w.find('[data-testid="fees-single-totals"]').text()).toContain('全家未繳合計 $5,000')
  })

  it('目前孩子有欠款：金額與標題同一位孩子', async () => {
    summaryMock.mockResolvedValue({
      data: {
        totals: { outstanding: 8000, overdue: 0 },
        by_student: [
          { student_id: 1, outstanding: 3000, amount_paid: 0 },
          { student_id: 2, outstanding: 5000, amount_paid: 0 },
        ],
      },
    })
    recordsMock.mockResolvedValue({
      data: { items: [{ ...paid, status: 'unpaid', amount_paid: 0, outstanding: 3000, due_date: '2099-01-01' }] },
    })
    const w = await mountView()
    expect(w.find('.dash-hero-title').text()).toBe('有待繳費用')
    expect(w.find('.dash-hero-value').text()).toBe('NT$ 3,000')
  })

  it('拿不到這位孩子的資料時退回全家合計，並明確標「全家」', async () => {
    summaryMock.mockResolvedValue({
      data: { totals: { outstanding: 5000, overdue: 0 }, by_student: [] },
    })
    recordsMock.mockRejectedValue({ displayMessage: '網路連線異常' })
    const w = await mountView()
    expect(w.find('.dash-hero-eyebrow').text()).toBe('全家未繳合計')
    expect(w.find('.dash-hero-title').text()).toBe('有待繳費用')
    expect(w.find('.dash-hero-value').text()).toBe('NT$ 5,000')
  })
})
