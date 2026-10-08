/**
 * FeesView 待繳置頂分組（2026-09-01 UI/UX 打磨）：
 * 原本費用列表按 API 回傳的時間序混排，未繳項散落中段、要靠「跳到應繳」
 * 跳轉；改為「待繳」（到期日近→遠）置頂、「已結清」隨後，任務動線一眼定位。
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

const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  FeeListGroup: true,
  FeeReceiptSheet: true,
  ChildContextHeader: true,
  StatusPill: true,
}

const SUMMARY = {
  data: {
    totals: { outstanding: 16500, overdue: 5500 },
    by_student: [{ student_id: 1, outstanding: 16500, amount_paid: 55900 }],
  },
}
// 刻意亂序＋未繳散中間：paid(02)、partial(03)、paid(04)、unpaid(07)
const REC = (id: number, status: string, due: string) => ({
  id, status, fee_item_name: `月費 ${due}`, amount_due: 11000,
  amount_paid: status === 'paid' ? 11000 : status === 'partial' ? 5500 : 0,
  outstanding: status === 'paid' ? 0 : status === 'partial' ? 5500 : 11000,
  due_date: due,
})
const RECORDS = {
  data: { items: [REC(1, 'paid', '2026-02-08'), REC(3, 'unpaid', '2026-07-08'), REC(2, 'partial', '2026-03-08'), REC(4, 'paid', '2026-04-08')] },
}

beforeEach(() => {
  summaryMock.mockReset()
  recordsMock.mockReset()
})

async function mountView() {
  setActivePinia(createPinia())
  const FeesView = (await import('@/parent/views/FeesView.vue')).default
  const w = mount(FeesView, { global: { stubs: STUBS } })
  await flushPromises()
  return w
}

describe('FeesView 待繳置頂分組', () => {
  it('有待繳時分成「待繳」與「已結清」兩組，待繳在前且依到期日升冪', async () => {
    summaryMock.mockResolvedValue(SUMMARY)
    recordsMock.mockResolvedValue(RECORDS)
    const w = await mountView()

    const titles = w.findAll('.pt-section-title').map((n) => n.text())
    expect(titles).toEqual(['待繳（2 筆）', '已結清'])

    const groups = w.findAllComponents({ name: 'FeeListGroup' })
    expect(groups.length).toBe(2)
    const pending = groups[0].props('records') as { id: number }[]
    const settled = groups[1].props('records') as { id: number }[]
    expect(pending.map((r) => r.id)).toEqual([2, 3]) // partial(03) → unpaid(07)
    expect(settled.map((r) => r.id)).toEqual([1, 4]) // 已結清維持原序
    w.unmount()
  })

  it('全部繳清時只有一組列表、不出現「待繳」標題', async () => {
    summaryMock.mockResolvedValue({ data: { totals: { outstanding: 0, overdue: 0 }, by_student: [] } })
    recordsMock.mockResolvedValue({ data: { items: [REC(1, 'paid', '2026-02-08'), REC(4, 'paid', '2026-04-08')] } })
    const w = await mountView()

    const titles = w.findAll('.pt-section-title').map((n) => n.text())
    expect(titles).toEqual([])
    const groups = w.findAllComponents({ name: 'FeeListGroup' })
    expect(groups.length).toBe(1)
    expect((groups[0].props('records') as { id: number }[]).map((r) => r.id)).toEqual([1, 4])
    w.unmount()
  })
})
