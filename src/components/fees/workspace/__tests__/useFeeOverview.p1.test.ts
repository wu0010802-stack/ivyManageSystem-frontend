/**
 * 2026-09-07 bug hunt：工作台待辦佇列會把「有事要做」報成綠燈的八個 P1。
 *
 * 每一組都對應一個在 staging 實測到（或以實測資料證實機制）的漏報：
 * 1. 發單批次只要產過一張就算完成 → 略過的未解析學生永久漏單
 * 2. 現金交接只看「今天」 → 前幾天卡住的未交接款完全不出現
 * 3. 預繳退款「去處理」導到不處理預繳退款的頁面（死路）
 * 4. 存摺待分類用「本月」口徑、目的地頁是全期間 → 跨月遺留報綠燈
 * 5. 代收待媒合只查 imported → 部分分配的錢被算成完成
 * 6. 「本月可以關帳」從月初就催，而關帳會 409 鎖死當月所有入帳
 * 7. module scope 快取不隨登出清空、離開再回來永不重抓
 * 8. 403／500 的列被歸進「沒有待辦」，整頁讀起來像一切正常
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

const sessionMocks = vi.hoisted(() => ({
  listeners: [] as Array<(c: { source: string }) => void>,
}))
vi.mock('@/utils/adminSession', () => ({
  onAdminSessionReset: (fn: (c: { source: string }) => void) => {
    sessionMocks.listeners.push(fn)
    return () => undefined
  },
}))

const TODAY = '2026-08-25'
vi.mock('@/utils/format', () => ({ todayTaipeiISO: () => TODAY }))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))

import { __resetFeeOverview, useFeeOverview } from '../useFeeOverview'

/** 全綠基線：所有項目都不是待處理 */
function allClear() {
  apiMocks.getCloseSummary.mockResolvedValue({
    bank: { unallocated: 0, unclassified_count: 0 },
    owner: { pending_refunds: 0 },
    checklist: { a: true, b: true },
  })
  apiMocks.getCashHandovers.mockResolvedValue({ items: [] })
  apiMocks.getFeePeriods.mockResolvedValue(['115-1'])
  apiMocks.getFeeSummary.mockResolvedValue({
    total_count: 10,
    unpaid_count: 0,
    partial_count: 0,
    total_unpaid: 0,
  })
  // 本月（2026-08）與上月（2026-07）都已關帳＝關帳列無待辦
  apiMocks.getClosePeriods.mockResolvedValue({
    items: [
      { close_year: 2026, close_month: 8, status: 'closed' },
      { close_year: 2026, close_month: 7, status: 'closed' },
    ],
  })
  apiMocks.getBillSlipBatches.mockResolvedValue([
    {
      net_total: 100,
      records_generated_count: 5,
      unresolved_count: 0,
      unresolved_amount: 0,
    },
  ])
  apiMocks.getCollectionPayments.mockResolvedValue({ total: 0 })
  apiMocks.getBankTransactions.mockResolvedValue({ total: 0 })
}

function itemOf(o: ReturnType<typeof useFeeOverview>, key: string) {
  const found = o.queueItems.value.find((i) => i.key === key)
  if (!found) throw new Error(`佇列沒有 ${key}`)
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
  // 刻意不清 listeners：註冊發生在 module 求值當下（import 時），清掉就測不到
  __resetFeeOverview()
  allClear()
})

describe('① 發單批次：略過的未解析學生要回到待辦', () => {
  it('已產單但仍有未解析列 → 待處理，不是綠勾', async () => {
    apiMocks.getBillSlipBatches.mockResolvedValue([
      {
        net_total: 2148669,
        records_generated_count: 194,
        unresolved_count: 3,
        unresolved_amount: 30240,
      },
    ])
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'billslips')
    expect(item.state).toBe('action')
    expect(item.title).toContain('3')
    expect(item.detail).toContain('30,240')
    expect(item.amount).toBe(30240)
  })

  it('未解析數為 0 且已產單 → 綠勾', async () => {
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(itemOf(o, 'billslips').state).toBe('ok')
  })

  it('完全沒產單仍是待辦（既有行為不得回歸）', async () => {
    apiMocks.getBillSlipBatches.mockResolvedValue([
      {
        net_total: 5000,
        records_generated_count: 0,
        unresolved_count: 0,
        unresolved_amount: 0,
      },
    ])
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'billslips')
    expect(item.state).toBe('action')
    expect(item.amount).toBe(5000)
  })
})

describe('② 現金交接：非今日的未結交接也要出現', () => {
  it('三天前的 draft 交接 → 待處理（不是「今日尚無現金收款」）', async () => {
    apiMocks.getCashHandovers.mockResolvedValue({
      items: [
        {
          business_date: '2026-08-22',
          status: 'draft',
          cash_receipt_total: 13000,
          variance: null,
        },
      ],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'handover')
    expect(item.state).toBe('action')
    expect(item.amount).toBe(13000)
    expect(item.title).not.toContain('今日尚無')
    expect(`${item.title}${item.detail}`).toContain('2026-08-22')
  })

  it('待老闆簽收的舊批次也算待辦', async () => {
    apiMocks.getCashHandovers.mockResolvedValue({
      items: [
        {
          business_date: '2026-08-20',
          status: 'submitted',
          cash_receipt_total: 8000,
          variance: null,
        },
      ],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(itemOf(o, 'handover').state).toBe('action')
  })

  it('全部已簽收 → 今日沒收現金時仍是「今日尚無現金收款」', async () => {
    apiMocks.getCashHandovers.mockResolvedValue({
      items: [
        {
          business_date: '2026-08-20',
          status: 'confirmed',
          cash_receipt_total: 8000,
          variance: 0,
        },
      ],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'handover')
    expect(item.state).toBe('muted')
    expect(item.title).toContain('今日尚無現金收款')
  })

  it('今日與舊批次同時未結 → 金額合計，且今日的狀態文案優先', async () => {
    apiMocks.getCashHandovers.mockResolvedValue({
      items: [
        {
          business_date: TODAY,
          status: 'draft',
          cash_receipt_total: 5000,
          variance: null,
        },
        {
          business_date: '2026-08-22',
          status: 'submitted',
          cash_receipt_total: 13000,
          variance: null,
        },
      ],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'handover')
    expect(item.state).toBe('action')
    expect(item.amount).toBe(18000)
  })
})

describe('③ 預繳退款：導向真的能處理它的頁面', () => {
  it('去處理不得導向「收款 › 退款」（那頁只列費用單退費）', async () => {
    apiMocks.getCloseSummary.mockResolvedValue({
      bank: { unallocated: 0, unclassified_count: 0 },
      owner: { pending_refunds: 2 },
      checklist: { a: true },
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'refunds')
    expect(item.state).toBe('action')
    expect(item.target.view).not.toBe('refunds')
    expect(item.target).toMatchObject({ ws: 'billing', view: 'cashItems' })
  })
})

describe('④ 存摺待分類：與目的地同軸（全期間、pending 狀態集合）', () => {
  it('用 /fees/bank-transactions?status=pending 而不是本月 closeSummary', async () => {
    apiMocks.getBankTransactions.mockResolvedValue({ total: 6 })
    // 本月統計是乾淨的，但全期間仍有 6 筆未分類
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(apiMocks.getBankTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    )
    const item = itemOf(o, 'passbook')
    expect(item.state).toBe('action')
    expect(item.title).toContain('6')
  })

  it('端點掛掉 → 狀態未知，不得報綠燈', async () => {
    apiMocks.getBankTransactions.mockRejectedValue(new Error('boom'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(itemOf(o, 'passbook').state).toBe('unknown')
  })
})

describe('⑤ 代收待媒合：查 pending 而不是只查 imported', () => {
  it('帶 status=pending 呼叫', async () => {
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    )
  })
})

describe('⑥ 關帳：本月進行中不催，改盯上個月', () => {
  it('本月未關帳但月份還沒結束 → 不是待處理', async () => {
    apiMocks.getClosePeriods.mockResolvedValue({
      items: [{ close_year: 2026, close_month: 7, status: 'closed' }],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'close')
    expect(item.state).not.toBe('action')
  })

  it('上個月尚未關帳 → 待處理，且文案指名上個月', async () => {
    apiMocks.getClosePeriods.mockResolvedValue({ items: [] })
    const o = useFeeOverview()
    await o.ensureLoaded()
    const item = itemOf(o, 'close')
    expect(item.state).toBe('action')
    expect(item.title).toContain('2026-07')
  })

  it('關帳紀錄查不到（載入失敗）→ 狀態未知，不得說「可以關帳」', async () => {
    apiMocks.getClosePeriods.mockRejectedValue(new Error('boom'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(itemOf(o, 'close').state).toBe('unknown')
  })

  it('本月已關帳 → 綠勾', async () => {
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(itemOf(o, 'close').state).toBe('ok')
  })
})

describe('⑦ 快取：換身分要清、太舊要重抓', () => {
  it('登出（admin session reset）後再 ensureLoaded 會重打 API', async () => {
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(1)

    expect(sessionMocks.listeners.length).toBeGreaterThan(0)
    sessionMocks.listeners.forEach((fn) => fn({ source: 'local' }))

    await o.ensureLoaded()
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(2)
  })

  it('快取過期後 ensureLoaded 會重抓（離開 /fees 再回來拿得到新數字）', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_000_000 + 5_000) // 5 秒內：沿用快取
    await o.ensureLoaded()
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_000_000 + 120_000) // 2 分鐘後：重抓
    await o.ensureLoaded()
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })
})

describe('⑧ 載入失敗不得偽裝成沒事', () => {
  it('全部失敗時每一列都是 unknown，且有 failed 旗標可供 UI 分組', async () => {
    apiMocks.getCloseSummary.mockRejectedValue(new Error('x'))
    apiMocks.getCashHandovers.mockRejectedValue(new Error('x'))
    apiMocks.getFeePeriods.mockRejectedValue(new Error('x'))
    apiMocks.getFeeSummary.mockRejectedValue(new Error('x'))
    apiMocks.getClosePeriods.mockRejectedValue(new Error('x'))
    apiMocks.getBillSlipBatches.mockRejectedValue(new Error('x'))
    apiMocks.getCollectionPayments.mockRejectedValue(new Error('x'))
    apiMocks.getBankTransactions.mockRejectedValue(new Error('x'))

    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(o.queueItems.value.every((i) => i.state === 'unknown')).toBe(true)
    expect(o.unknownItems.value).toHaveLength(7)
    expect(o.restItems.value).toHaveLength(0)
  })

  it('403 會被辨識成權限不足，畫面才說得出「你沒有權限」', async () => {
    const forbidden = Object.assign(new Error('forbidden'), {
      response: { status: 403 },
    })
    apiMocks.getCloseSummary.mockRejectedValue(forbidden)
    apiMocks.getFeeSummary.mockRejectedValue(forbidden)
    apiMocks.getCashHandovers.mockRejectedValue(forbidden)
    apiMocks.getClosePeriods.mockRejectedValue(forbidden)
    apiMocks.getBillSlipBatches.mockRejectedValue(forbidden)
    apiMocks.getCollectionPayments.mockRejectedValue(forbidden)
    apiMocks.getBankTransactions.mockRejectedValue(forbidden)

    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(o.forbidden.value).toBe(true)
  })

  it('一般錯誤不得被誤判成權限不足', async () => {
    apiMocks.getCloseSummary.mockRejectedValue(new Error('boom'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(o.forbidden.value).toBe(false)
  })
})
