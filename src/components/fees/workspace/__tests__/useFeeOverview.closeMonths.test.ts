/**
 * 工作台「關帳」待辦（2026-11-02 bug hunt F3）。
 *
 * staging 實測：今天 2026-11，待辦寫「上個月（2026-10）尚未關帳 → 去月結」，
 * 點進去月結落在 2026-11（target 沒帶月份，CloseTab 預設本月）；而 2026-09
 * 也沒關帳，工作台只看「上個月」完全不提醒。
 *
 * 修法：
 *   (a) 導航目標帶最早未關帳月份（month=YYYY-MM），月結頁讀它切到該月
 *   (b) 檢查範圍改為「本學期起始月 → 上個月」（上學期 8/1–隔年 1/31、
 *       下學期 2/1–7/31）；本月是學期第一個月時區間只剩上個月（上個月屬
 *       上一學期仍要催，維持舊行為）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  getCloseSummary: vi.fn(),
  getCashHandovers: vi.fn(),
  getFeePeriods: vi.fn(),
  getFeeSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  getBillSlipBatches: vi.fn(),
  getCollectionPayments: vi.fn(),
  getBankTransactions: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

vi.mock('@/utils/adminSession', () => ({ onAdminSessionReset: () => () => undefined }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

const clock = vi.hoisted(() => ({ today: '2026-11-02' }))
vi.mock('@/utils/format', () => ({ todayTaipeiISO: () => clock.today }))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))

import {
  __resetFeeOverview,
  overdueCloseMonths,
  semesterStartMonth,
  useFeeOverview,
} from '../useFeeOverview'

function closedRows(...labels: string[]) {
  return {
    items: labels.map((label) => {
      const [y, m] = label.split('-').map(Number)
      return { close_year: y, close_month: m, status: 'closed' }
    }),
  }
}

function closeItemOf(o: ReturnType<typeof useFeeOverview>) {
  const found = o.queueItems.value.find((i) => i.key === 'close')
  if (!found) throw new Error('佇列沒有 close')
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetFeeOverview()
  clock.today = '2026-11-02'
  apiMocks.getCloseSummary.mockResolvedValue({
    bank: { unallocated: 0, unclassified_count: 0 },
    owner: { pending_refunds: 0 },
    checklist: { a: true },
  })
  apiMocks.getCashHandovers.mockResolvedValue({ items: [] })
  apiMocks.getFeePeriods.mockResolvedValue(['115-1'])
  apiMocks.getFeeSummary.mockResolvedValue({
    total_count: 1,
    unpaid_count: 0,
    partial_count: 0,
    total_unpaid: 0,
  })
  apiMocks.getClosePeriods.mockResolvedValue({ items: [] })
  apiMocks.getBillSlipBatches.mockResolvedValue([])
  apiMocks.getCollectionPayments.mockResolvedValue({ total: 0 })
  apiMocks.getBankTransactions.mockResolvedValue({ total: 0 })
})

describe('semesterStartMonth：學期起始月', () => {
  it.each([
    ['2026-08', '2026-08'],
    ['2026-11', '2026-08'],
    ['2026-12', '2026-08'],
    ['2027-01', '2026-08'],
    ['2027-02', '2027-02'],
    ['2027-05', '2027-02'],
    ['2027-07', '2027-02'],
  ])('%s → %s', (month, expected) => {
    expect(semesterStartMonth(month)).toBe(expected)
  })
})

describe('overdueCloseMonths：本學期起始月到上個月之間未關帳者（升冪）', () => {
  const none = () => false

  it('上學期中（11 月）：8、9、10 月都要檢查', () => {
    expect(overdueCloseMonths('2026-11', none)).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('已關帳月份排除', () => {
    const closed = new Set(['2026-08', '2026-10'])
    expect(overdueCloseMonths('2026-11', (m) => closed.has(m))).toEqual(['2026-09'])
  })

  it('跨年（隔年 1 月）仍屬上學期：8–12 月', () => {
    expect(overdueCloseMonths('2027-01', none)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ])
  })

  it('學期第一個月（8 月）：區間只剩上個月（7 月，屬上一學期仍要催）', () => {
    expect(overdueCloseMonths('2026-08', none)).toEqual(['2026-07'])
  })

  it('下學期第一個月（2 月）：只檢查 1 月', () => {
    expect(overdueCloseMonths('2027-02', none)).toEqual(['2027-01'])
  })

  it('下學期中（5 月）：2、3、4 月', () => {
    expect(overdueCloseMonths('2027-05', none)).toEqual(['2027-02', '2027-03', '2027-04'])
  })

  it('全數已關帳 → 空陣列', () => {
    expect(overdueCloseMonths('2026-11', () => true)).toEqual([])
  })
})

describe('工作台關帳待辦：帶月份導航＋涵蓋本學期更早的未關帳月份', () => {
  it('只有上個月未關帳 → 文案維持「上個月（YYYY-MM）」，連結帶該月', async () => {
    apiMocks.getClosePeriods.mockResolvedValue(closedRows('2026-08', '2026-09'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = closeItemOf(o)
    expect(item.state).toBe('action')
    expect(item.title).toBe('上個月（2026-10）尚未關帳')
    expect(item.target).toEqual({ ws: 'settlement', view: 'close', month: '2026-10' })
  })

  it('9、10 月都未關帳 → 「2026-09 起 2 個月尚未關帳」，連結帶最早的 2026-09', async () => {
    apiMocks.getClosePeriods.mockResolvedValue(closedRows('2026-08'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = closeItemOf(o)
    expect(item.state).toBe('action')
    expect(item.title).toBe('2026-09 起 2 個月尚未關帳')
    expect(item.detail).toContain('2026-09、2026-10')
    expect(item.target).toEqual({ ws: 'settlement', view: 'close', month: '2026-09' })
  })

  it('上個月已關帳但更早的 9 月沒關 → 仍提醒並指名 2026-09（舊版完全不提醒）', async () => {
    apiMocks.getClosePeriods.mockResolvedValue(closedRows('2026-08', '2026-10'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = closeItemOf(o)
    expect(item.state).toBe('action')
    expect(item.title).toBe('2026-09 尚未關帳')
    expect(item.target).toEqual({ ws: 'settlement', view: 'close', month: '2026-09' })
  })

  it('本學期到上個月全數已關帳 → 不催（本月進行中）', async () => {
    apiMocks.getClosePeriods.mockResolvedValue(closedRows('2026-08', '2026-09', '2026-10'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = closeItemOf(o)
    expect(item.state).not.toBe('action')
  })

  it('非 closed 狀態（重開中）視同未關帳', async () => {
    apiMocks.getClosePeriods.mockResolvedValue({
      items: [
        { close_year: 2026, close_month: 8, status: 'closed' },
        { close_year: 2026, close_month: 9, status: 'closed' },
        { close_year: 2026, close_month: 10, status: 'reopened' },
      ],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(closeItemOf(o).title).toBe('上個月（2026-10）尚未關帳')
  })
})
