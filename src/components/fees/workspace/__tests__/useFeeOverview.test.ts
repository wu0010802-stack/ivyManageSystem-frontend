/**
 * useFeeOverview：待辦總覽的共用載入與衍生。
 *
 * 重點是兩件改版後才有的行為：
 * ① module scope 共用一次載入（工作台與主導航頁籤不得各打一輪 API）
 * ② todoCounts＝各工作區的「待處理」項目數（頁籤徽章語意），
 *    刻意不用未收筆數這種業務量級數字。
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
}))
vi.mock('@/api/fees', () => apiMocks)

const TODAY = '2026-08-25'
vi.mock('@/utils/format', () => ({ todayISO: () => TODAY }))
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
  apiMocks.getClosePeriods.mockResolvedValue({
    items: [{ close_year: 2026, close_month: 8, status: 'closed' }],
  })
  apiMocks.getBillSlipBatches.mockResolvedValue([
    { net_total: 100, records_generated_count: 5 },
  ])
  apiMocks.getCollectionPayments.mockResolvedValue({ total: 0 })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetFeeOverview()
  allClear()
})

describe('useFeeOverview 載入去重', () => {
  it('多個消費端共用同一次載入（API 各只打一次）', async () => {
    const a = useFeeOverview()
    const b = useFeeOverview()
    await Promise.all([a.ensureLoaded(), b.ensureLoaded()])
    expect(apiMocks.getCloseSummary).toHaveBeenCalledTimes(1)
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledTimes(1)
  })

  it('已載入後再 ensureLoaded 不重打 API', async () => {
    const o = useFeeOverview()
    await o.ensureLoaded()
    await o.ensureLoaded()
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(1)
  })

  it('refresh 會重新載入一輪', async () => {
    const o = useFeeOverview()
    await o.ensureLoaded()
    await o.refresh()
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(2)
  })

  it('代收明細只取分頁 total（page_size=1，不拉明細）', async () => {
    await useFeeOverview().ensureLoaded()
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledWith({
      status: 'imported',
      page: 1,
      page_size: 1,
    })
  })
})

describe('useFeeOverview 待辦數（主導航徽章）', () => {
  it('全部收齊時各工作區皆為 0', async () => {
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(o.todoCounts.value).toEqual({
      workbench: 0,
      billing: 0,
      settlement: 0,
    })
    expect(o.actionItems.value).toHaveLength(0)
  })

  it('待辦歸屬到對應工作區，數字＝待處理項目數而非業務量級', async () => {
    apiMocks.getFeeSummary.mockResolvedValue({
      total_count: 190,
      unpaid_count: 60,
      partial_count: 2,
      total_unpaid: 1054000,
    })
    apiMocks.getCollectionPayments.mockResolvedValue({ total: 7 })
    apiMocks.getCashHandovers.mockResolvedValue({
      items: [
        {
          business_date: TODAY,
          status: 'submitted',
          cash_receipt_total: 51000,
          variance: null,
        },
      ],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    // 收款：費用單未收齊 ＋ 代收待媒合＝2；結算：現金待簽收＝1
    expect(o.todoCounts.value.billing).toBe(2)
    expect(o.todoCounts.value.settlement).toBe(1)
    // 不是 62（未收筆數）也不是金額
    expect(o.todoCounts.value.billing).not.toBe(62)
  })

  it('待處理依金額大到小排序', async () => {
    apiMocks.getFeeSummary.mockResolvedValue({
      total_count: 190,
      unpaid_count: 60,
      partial_count: 2,
      total_unpaid: 1054000,
    })
    apiMocks.getCloseSummary.mockResolvedValue({
      bank: { unallocated: 9720, unclassified_count: 2 },
      owner: { pending_refunds: 0 },
      checklist: { a: true },
    })
    apiMocks.getCashHandovers.mockResolvedValue({
      items: [
        {
          business_date: TODAY,
          status: 'submitted',
          cash_receipt_total: 51000,
          variance: null,
        },
      ],
    })
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(o.actionItems.value.map((i) => i.key)).toEqual([
      'receivable',
      'handover',
      'passbook',
    ])
  })

  it('待處理排在佇列最前，其餘依固定順序排後面', async () => {
    apiMocks.getCollectionPayments.mockResolvedValue({ total: 7 })
    const o = useFeeOverview()
    await o.ensureLoaded()
    const keys = o.queueItems.value.map((i) => i.key)
    expect(keys[0]).toBe('collection')
    expect(o.actionItems.value).toHaveLength(1)
    expect(keys).toHaveLength(7)
  })

  it('發單批次待產單數與金額供應收帳款提示條使用', async () => {
    apiMocks.getBillSlipBatches.mockResolvedValue([
      { net_total: 2148669, records_generated_count: 0 },
      { net_total: 1775200, records_generated_count: 119 },
    ])
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(o.pendingBillSlips.value).toBe(1)
    expect(o.pendingBillSlipAmount.value).toBe(2148669)
  })

  it('API 失敗的項目不計入待辦數（不虛構待辦）', async () => {
    apiMocks.getCloseSummary.mockRejectedValue(new Error('403'))
    apiMocks.getCollectionPayments.mockRejectedValue(new Error('403'))
    const o = useFeeOverview()
    await o.ensureLoaded()
    expect(o.todoCounts.value.billing).toBe(0)
    expect(o.todoCounts.value.settlement).toBe(0)
  })
})
