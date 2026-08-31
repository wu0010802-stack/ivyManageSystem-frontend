/**
 * POS 日結簽核頁 2026-08-14 審查修正（P2-01/02/05/08、P3-01/02/03/08/14）。
 *
 * 本頁在 happy-dom 下可掛載，但 element-plus 未於測試環境註冊，`#header` 之類的
 * 具名插槽不會渲染；因此「卡片標題列」相關斷言改以 SFC 原始碼比對，其餘一律以
 * setupState 的實際行為（函式呼叫、送出 payload、computed 值）斷言。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const SFC_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/views/activity/POSApprovalView.vue'),
  'utf-8',
)

interface SetupState {
  selectedDate: string
  form: { actualCashCount: number | null; note: string }
  detail: unknown
  pendingMeta: { older_pending_count: number; oldest_pending_date: string | null }
  cashCountRequired: boolean
  approveDisabled: boolean
  cashCountPlaceholder: string
  handlePendingSelect: (row: { date: string } | null) => void
  handleReconRowClick: (row: { date: string }) => void
  handleApprove: () => Promise<void>
  widenPendingRange: () => Promise<void>
  historyCount: number
}

const PENDING_EMPTY = {
  data: { pending: [], start_date: '', end_date: '', older_pending_count: 0, oldest_pending_date: null },
}
const DETAIL_PENDING = {
  data: {
    status: 'pending',
    payment_total: 5000,
    refund_total: 0,
    net_total: 5000,
    transaction_count: 4,
    by_method: { 現金: 5000 },
    cash_count_required: false,
  },
}

// element-plus 未在測試環境註冊；版面容器以會轉發 slot 的最小 stub 取代，
// 帶 scoped slot 的表格則整個 stub 掉（本檔一律以 setupState 行為斷言，不點 DOM）。
const passThrough = (tpl: string) => ({ template: tpl })

function mountView() {
  return mount(POSApprovalView, {
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
}

async function mountReady() {
  const wrapper = mountView()
  await flushPromises()
  return { wrapper, ss: wrapper.vm.$.setupState as unknown as SetupState }
}

beforeEach(() => {
  apiMocks.getPOSDailyClosePending.mockResolvedValue(PENDING_EMPTY)
  apiMocks.getPOSDailyCloseStatus.mockResolvedValue(DETAIL_PENDING)
  apiMocks.getPOSRecentTransactions.mockResolvedValue({ data: { transactions: [] } })
  apiMocks.getPOSReconciliation.mockResolvedValue({ data: { items: [], totals: {} } })
  apiMocks.approvePOSDailyClose.mockResolvedValue({ data: { warnings: [] } })
  apiMocks.unlockPOSDailyClose.mockResolvedValue({ data: {} })
  apiMocks.getPOSCloseHistory.mockResolvedValue({
    data: { close_date: '', count: 0, snapshots: [] },
  })
  elMocks.confirm.mockResolvedValue('confirm')
  elMocks.alert.mockResolvedValue('confirm')
})

describe('P2-08：切換日期前保護已填的盤點金額與備註', () => {
  it('表單有髒值時，點對帳列先跳確認框；取消則不切換日期', async () => {
    const { ss } = await mountReady()
    const original = ss.selectedDate
    ss.form.actualCashCount = 4800
    elMocks.confirm.mockRejectedValueOnce(new Error('cancel'))

    ss.handleReconRowClick({ date: '2026-08-01' })
    await flushPromises()

    expect(elMocks.confirm).toHaveBeenCalled()
    expect(String(elMocks.confirm.mock.calls[0][0])).toContain('盤點金額')
    expect(ss.selectedDate).toBe(original)
  })

  it('備註有值也算髒值（僅備註時同樣先確認）', async () => {
    const { ss } = await mountReady()
    const original = ss.selectedDate
    ss.form.note = '現金短少 50'
    elMocks.confirm.mockRejectedValueOnce(new Error('cancel'))

    ss.handleReconRowClick({ date: '2026-08-01' })
    await flushPromises()

    expect(elMocks.confirm).toHaveBeenCalledTimes(1)
    expect(ss.selectedDate).toBe(original)
  })

  it('確認後才切換日期', async () => {
    const { ss } = await mountReady()
    ss.form.actualCashCount = 4800

    ss.handleReconRowClick({ date: '2026-08-01' })
    await flushPromises()

    expect(ss.selectedDate).toBe('2026-08-01')
  })

  it('表單無髒值時直接切換、完全不打擾', async () => {
    const { ss } = await mountReady()

    ss.handleReconRowClick({ date: '2026-08-02' })
    await flushPromises()

    expect(elMocks.confirm).not.toHaveBeenCalled()
    expect(ss.selectedDate).toBe('2026-08-02')
  })

  it('待簽核清單選取（handlePendingSelect）走同一道守衛', async () => {
    const { ss } = await mountReady()
    const original = ss.selectedDate
    ss.form.actualCashCount = 1000
    elMocks.confirm.mockRejectedValueOnce(new Error('cancel'))

    ss.handlePendingSelect({ date: '2026-07-30' })
    await flushPromises()

    expect(elMocks.confirm).toHaveBeenCalled()
    expect(ss.selectedDate).toBe(original)
  })

  it('對帳表列有可點擊的游標提示', () => {
    expect(SFC_SOURCE).toContain('cursor: pointer')
  })
})

describe('P3-02：後端判定必須盤點時，欄位就要長得像必填', () => {
  it('cash_count_required=true 時 placeholder 改為必填語意', async () => {
    apiMocks.getPOSDailyCloseStatus.mockResolvedValue({
      data: { ...DETAIL_PENDING.data, cash_count_required: true },
    })
    const { ss } = await mountReady()

    expect(ss.cashCountRequired).toBe(true)
    expect(ss.cashCountPlaceholder).toContain('必填')
  })

  it('必填未填時簽核鈕停用，而不是按下去才被擋回', async () => {
    apiMocks.getPOSDailyCloseStatus.mockResolvedValue({
      data: { ...DETAIL_PENDING.data, cash_count_required: true },
    })
    const { ss } = await mountReady()

    expect(ss.approveDisabled).toBe(true)
    ss.form.actualCashCount = 5000
    await flushPromises()
    expect(ss.approveDisabled).toBe(false)
  })

  it('非必填時 placeholder 維持「可選」語意且不停用', async () => {
    const { ss } = await mountReady()
    expect(ss.cashCountRequired).toBe(false)
    expect(ss.cashCountPlaceholder).toContain('可選')
    expect(ss.approveDisabled).toBe(false)
  })

  it('el-form-item 依 cashCountRequired 動態掛必填標記', () => {
    expect(SFC_SOURCE).toContain(':required="cashCountRequired"')
  })
})

describe('P2-01：簽核送出帶樂觀鎖欄位，409 阻斷式說明', () => {
  it('送出時帶 expected_net_total 與 expected_transaction_count', async () => {
    const { ss } = await mountReady()
    await ss.handleApprove()

    const payload = apiMocks.approvePOSDailyClose.mock.calls[0][1] as Record<string, unknown>
    expect(payload.expected_net_total).toBe(5000)
    expect(payload.expected_transaction_count).toBe(4)
  })

  it('409 時彈阻斷式對話框並重新載入狀態', async () => {
    const { ss } = await mountReady()
    apiMocks.getPOSDailyCloseStatus.mockClear()
    apiMocks.approvePOSDailyClose.mockRejectedValueOnce({
      response: { status: 409, data: { detail: '你送出時看到的是 5000／實際為 5300' } },
    })

    await ss.handleApprove()
    await flushPromises()

    expect(elMocks.alert).toHaveBeenCalled()
    expect(apiMocks.getPOSDailyCloseStatus).toHaveBeenCalled()
  })
})

describe('P3-03：簽核／解鎖失敗後一律重載狀態', () => {
  it('一般失敗（非 409）也會重新載入 detail', async () => {
    const { ss } = await mountReady()
    apiMocks.getPOSDailyCloseStatus.mockClear()
    apiMocks.approvePOSDailyClose.mockRejectedValueOnce({
      response: { status: 500, data: { detail: '伺服器錯誤' } },
    })

    await ss.handleApprove()
    await flushPromises()

    expect(elMocks.error).toHaveBeenCalled()
    expect(apiMocks.getPOSDailyCloseStatus).toHaveBeenCalled()
  })

  it('doUnlock 失敗後同樣重載', () => {
    const start = SFC_SOURCE.indexOf('async function doUnlock')
    expect(start).toBeGreaterThan(-1)
    const body = SFC_SOURCE.slice(start, SFC_SOURCE.indexOf('watch(selectedDate', start))
    expect(body).toContain('解鎖失敗')
    expect(body).toContain('await loadDetail()')
  })
})

describe('P2-05：簽核當日需 opt-in', () => {
  it('選取日為今日（台北）時多跳一次確認並帶 confirm_close_today', async () => {
    const { ss } = await mountReady()
    expect(ss.selectedDate).toBe(todayTaipeiISO())

    await ss.handleApprove()

    const bodies = elMocks.confirm.mock.calls.map((c) => String(c[0]))
    expect(bodies.some((b) => b.includes('無法自行解鎖'))).toBe(true)
    const payload = apiMocks.approvePOSDailyClose.mock.calls[0][1] as Record<string, unknown>
    expect(payload.confirm_close_today).toBe(true)
  })

  it('當日二次確認被取消時不送出', async () => {
    const { ss } = await mountReady()
    elMocks.confirm.mockRejectedValue(new Error('cancel'))

    await ss.handleApprove()

    expect(apiMocks.approvePOSDailyClose).not.toHaveBeenCalled()
  })

  it('非今日不帶 confirm_close_today=true', async () => {
    const { ss } = await mountReady()
    ss.handleReconRowClick({ date: '2026-07-01' })
    await flushPromises()

    await ss.handleApprove()

    const payload = apiMocks.approvePOSDailyClose.mock.calls[0][1] as Record<string, unknown>
    expect(payload.confirm_close_today).toBe(false)
  })
})

describe('P2-02：區間外的未簽核積壓要看得見', () => {
  it('顯示「另有 N 天更早的未簽核日（最早 …）」', async () => {
    apiMocks.getPOSDailyClosePending.mockResolvedValue({
      data: {
        pending: [],
        start_date: '2026-07-16',
        end_date: '2026-08-14',
        older_pending_count: 3,
        oldest_pending_date: '2026-05-02',
      },
    })
    const { wrapper } = await mountReady()

    const text = wrapper.text()
    expect(text).toContain('另有 3 天更早的未簽核日')
    expect(text).toContain('2026-05-02')
  })

  it('一鍵放寬區間會以最早未簽核日重查', async () => {
    apiMocks.getPOSDailyClosePending.mockResolvedValue({
      data: {
        pending: [],
        start_date: '2026-07-16',
        end_date: '2026-08-14',
        older_pending_count: 3,
        oldest_pending_date: '2026-05-02',
      },
    })
    const { ss } = await mountReady()
    apiMocks.getPOSDailyClosePending.mockClear()

    await ss.widenPendingRange()

    const params = apiMocks.getPOSDailyClosePending.mock.calls[0][0] as Record<string, unknown>
    expect(params.start_date).toBe('2026-05-02')
  })

  it('沒有更早積壓時不顯示提示', async () => {
    const { wrapper } = await mountReady()
    expect(wrapper.text()).not.toContain('更早的未簽核日')
  })
})

describe('P3-01：日期一律以台北時區為準', () => {
  it('不再自 utils/format 匯入瀏覽器本地時區的 todayISO / offsetISO', () => {
    // 沒 import 就不可能用到；直接檢查 import 敘述比掃全檔（會掃到註解）精準。
    const importLine = /import\s*\{([^}]*)\}\s*from\s*'@\/utils\/format'/.exec(SFC_SOURCE)
    expect(importLine).toBeTruthy()
    const named = importLine![1]
    expect(named).not.toMatch(/\btodayISO\b/)
    expect(named).not.toMatch(/\boffsetISO\b/)
    expect(named).toMatch(/\btodayTaipeiISO\b/)
  })

  it('初值與對帳區間端點皆為台北今日，且區間長度 30 天', async () => {
    await mountReady()
    const [start, end] = apiMocks.getPOSReconciliation.mock.calls[0] as [string, string]
    expect(end).toBe(todayTaipeiISO())
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000
    expect(days).toBe(29)
  })
})

describe('P3-08：待簽核卡片補 loading', () => {
  it('第一張卡也接上 v-loading="loadingPending"', () => {
    expect(SFC_SOURCE).toContain('v-loading="loadingPending"')
  })
})

describe('P3-14：歷史快照面板掛進簽核狀態卡', () => {
  it('掛載 POSCloseHistoryPanel 並綁定 selectedDate', () => {
    expect(SFC_SOURCE).toContain('POSCloseHistoryPanel')
    expect(SFC_SOURCE).toContain(':close-date="selectedDate"')
  })

  it('count > 0 時卡頭顯示「本日曾解鎖 N 次」', () => {
    expect(SFC_SOURCE).toContain('本日曾解鎖')
    expect(SFC_SOURCE).toContain('historyCount')
  })
})
