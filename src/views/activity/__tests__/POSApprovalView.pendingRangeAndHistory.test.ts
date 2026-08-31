/**
 * POS 日結簽核頁 2026-08-24 修正：
 *
 * - FEAPV-02 / CONTRACT-03：「放寬查詢區間」把起點設為 oldest_pending_date，
 *   但該值不受 92 天上限、pending 端點受，積壓超過 92 天時必定 400；更糟的是
 *   pendingRange 已被改成無效值，之後每次簽核／解鎖後的 refreshAll 都再 400 一次，
 *   待簽核清單凍結在舊資料。積壓越久越用不了，正好是最需要它的時候。
 * - FEAPV-03：解鎖成功後不重載歷史快照面板，剛寫下的解鎖原因與解鎖前帳面看不到
 *   （第一次解鎖時該面板 count===0 自身不渲染，要切走再切回來才會出現）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({
  approvePOSDailyClose: vi.fn(),
  getPOSDailyClosePending: vi.fn(),
  getPOSDailyCloseStatus: vi.fn(),
  getPOSReconciliation: vi.fn(),
  getPOSRecentTransactions: vi.fn(),
  unlockPOSDailyClose: vi.fn(),
  getPOSCloseHistory: vi.fn(),
}))
vi.mock('@/api/activity', () => apiMocks)

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
  getUserInfo: () => ({ username: 'boss', role: 'admin' }),
}))

const elMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  alert: vi.fn(),
  prompt: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: {
    success: elMocks.success,
    error: elMocks.error,
    warning: elMocks.warning,
    info: elMocks.info,
  },
  ElMessageBox: {
    confirm: elMocks.confirm,
    alert: elMocks.alert,
    prompt: elMocks.prompt,
  },
}))

import POSApprovalView from '../POSApprovalView.vue'
import { todayTaipeiISO } from '@/utils/format'

interface SetupState {
  selectedDate: string
  pendingRange: { start_date?: string; end_date?: string } | null
  pendingMeta: { older_pending_count: number; oldest_pending_date: string | null }
  widenPendingRange: () => Promise<void>
  doUnlock: (opts: { isOverride: boolean; minLen: number }) => Promise<void>
  historyReloadToken: number
  historyCount: number
}

/** 以 UTC 曆算推移天數，與元件內 taipeiOffsetISO 的做法一致。 */
function isoOffset(days: number): string {
  const [y, m, d] = todayTaipeiISO().split('-').map(Number)
  const base = Date.UTC(y, m - 1, d) + days * 86400000
  return new Date(base).toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
}

const passThrough = (tpl: string) => ({ template: tpl })

async function mountReady() {
  const wrapper = mount(POSApprovalView, {
    global: {
      directives: { loading: {} },
      stubs: {
        PageHeader: true,
        POSSemesterReconciliation: true,
        POSCloseHistoryPanel: true,
        StatCard: true,
        AdminListToolbar: true,
        'el-table': true,
        'el-table-column': true,
        'el-date-picker': true,
        'el-tabs': passThrough('<div><slot /></div>'),
        'el-tab-pane': passThrough('<div><slot /></div>'),
        'el-card': passThrough('<div><slot name="header" /><slot /></div>'),
        'el-button': passThrough('<button><slot /></button>'),
      },
    },
  })
  await flushPromises()
  return { wrapper, ss: wrapper.vm.$.setupState as unknown as SetupState }
}

/** 後端 pending 端點的區間上限。 */
const MAX_DAYS = 92

beforeEach(() => {
  apiMocks.getPOSDailyClosePending.mockResolvedValue({
    data: {
      pending: [],
      start_date: '',
      end_date: '',
      older_pending_count: 0,
      oldest_pending_date: null,
    },
  })
  apiMocks.getPOSDailyCloseStatus.mockResolvedValue({
    data: {
      status: 'approved',
      approver_username: 'other_boss',
      payment_total: 5000,
      refund_total: 0,
      net_total: 5000,
      transaction_count: 4,
      by_method: { 現金: 5000 },
      cash_count_required: false,
    },
  })
  apiMocks.getPOSRecentTransactions.mockResolvedValue({ data: { transactions: [] } })
  apiMocks.getPOSReconciliation.mockResolvedValue({ data: { items: [], totals: {} } })
  apiMocks.approvePOSDailyClose.mockResolvedValue({ data: { warnings: [] } })
  apiMocks.unlockPOSDailyClose.mockResolvedValue({ data: {} })
  apiMocks.getPOSCloseHistory.mockResolvedValue({
    data: { close_date: '', count: 0, snapshots: [] },
  })
  elMocks.confirm.mockResolvedValue('confirm')
  elMocks.alert.mockResolvedValue('confirm')
  elMocks.prompt.mockResolvedValue({ value: '盤點差異需重新確認金額' })
})

describe('FEAPV-02：積壓超過 92 天時「放寬查詢區間」仍要可用', () => {
  it('積壓 200 天：分段請求且每段都在 92 天上限內，涵蓋到最早那天', async () => {
    const { ss } = await mountReady()
    const oldest = isoOffset(-200)
    ss.pendingMeta.oldest_pending_date = oldest
    ss.pendingMeta.older_pending_count = 3
    apiMocks.getPOSDailyClosePending.mockClear()

    await ss.widenPendingRange()
    await flushPromises()

    const calls = apiMocks.getPOSDailyClosePending.mock.calls
    expect(calls.length).toBeGreaterThan(1)

    for (const [params] of calls) {
      const span = daysBetween(params.start_date, params.end_date)
      expect(span).toBeLessThanOrEqual(MAX_DAYS)
      expect(span).toBeGreaterThanOrEqual(0)
    }

    const starts = calls.map(([p]) => p.start_date).sort()
    const ends = calls.map(([p]) => p.end_date).sort()
    expect(starts[0]).toBe(oldest)
    expect(ends[ends.length - 1]).toBe(todayTaipeiISO())
    expect(elMocks.error).not.toHaveBeenCalled()
  })

  it('積壓 30 天（未超上限）：維持單一請求，行為與修改前相同', async () => {
    const { ss } = await mountReady()
    ss.pendingMeta.oldest_pending_date = isoOffset(-30)
    apiMocks.getPOSDailyClosePending.mockClear()

    await ss.widenPendingRange()
    await flushPromises()

    expect(apiMocks.getPOSDailyClosePending).toHaveBeenCalledTimes(1)
  })

  it('合併多段結果：待簽核日去重且不遺漏', async () => {
    const { ss } = await mountReady()
    ss.pendingMeta.oldest_pending_date = isoOffset(-200)
    apiMocks.getPOSDailyClosePending.mockClear()
    let seq = 0
    apiMocks.getPOSDailyClosePending.mockImplementation(() => {
      seq += 1
      return Promise.resolve({
        data: {
          pending: [{ date: `2026-0${seq}-01`, payment_total: 100 * seq }],
          older_pending_count: seq === 1 ? 5 : 0,
          oldest_pending_date: seq === 1 ? isoOffset(-400) : null,
        },
      })
    })

    await ss.widenPendingRange()
    await flushPromises()

    const wrapperState = ss as unknown as { pending?: Array<{ date: string }> }
    const dates = (wrapperState.pending || []).map((p) => p.date)
    expect(new Set(dates).size).toBe(dates.length)
    expect(dates.length).toBeGreaterThan(1)
    // 更早的積壓提示要取自最早那一段，否則「還有更早」的線索會被後段覆蓋掉
    expect(ss.pendingMeta.older_pending_count).toBe(5)
  })

  it('請求失敗時把區間還原，不讓後續每次重載都跟著失敗', async () => {
    const { ss } = await mountReady()
    const before = ss.pendingRange
    ss.pendingMeta.oldest_pending_date = isoOffset(-200)
    apiMocks.getPOSDailyClosePending.mockRejectedValue({
      response: { data: { detail: '區間不可超過 92 天' } },
    })

    await ss.widenPendingRange()
    await flushPromises()

    expect(ss.pendingRange).toEqual(before)
  })
})

describe('FEAPV-03：解鎖成功後要看得到剛寫下的解鎖原因與解鎖前帳面', () => {
  it('解鎖成功後歷史快照面板被要求重載', async () => {
    const { ss } = await mountReady()
    const before = ss.historyReloadToken

    await ss.doUnlock({ isOverride: false, minLen: 10 })
    await flushPromises()

    expect(apiMocks.unlockPOSDailyClose).toHaveBeenCalled()
    expect(ss.historyReloadToken).toBeGreaterThan(before)
  })

  it('切換日期時解鎖次數歸零，不把前一天的次數掛在新日期上', async () => {
    const { ss } = await mountReady()
    ss.historyCount = 3

    ss.selectedDate = '2026-08-01'
    await flushPromises()

    expect(ss.historyCount).toBe(0)
  })
})
