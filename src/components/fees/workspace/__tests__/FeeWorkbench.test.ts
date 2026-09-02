/**
 * 工作台測試：佇列項目的狀態/計數/導航、待處理優先排序（2026-09-02 改版），
 * 以及 API 失敗時的「不顯示假數字、只留狀態與入口」降級行為。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

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

// 固定「今天」避免測試依日期漂移
const TODAY = '2026-08-25'
vi.mock('@/utils/format', () => ({ todayISO: () => TODAY }))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))

const GLOBAL_STUBS = {
  'el-skeleton': { template: '<div data-testid="skeleton" />' },
  'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
}

const flushAll = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import FeeWorkbench from '../FeeWorkbench.vue'
import { __resetFeeOverview } from '../useFeeOverview'

const BASE_SUMMARY = {
  bank: { unallocated: 10800, unclassified_count: 3 },
  owner: { pending_refunds: 2 },
  checklist: {
    all_bank_transactions_classified: false,
    bank_fully_allocated: false,
    handover_all_confirmed: true,
    handover_variance_zero: true,
    no_pending_refunds: false,
    equation_balanced: true,
  },
}

function mountWorkbench() {
  return mount(FeeWorkbench, { global: { stubs: GLOBAL_STUBS } })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetFeeOverview()
  apiMocks.getCloseSummary.mockResolvedValue(BASE_SUMMARY)
  apiMocks.getCashHandovers.mockResolvedValue({
    total: 1,
    items: [
      {
        id: 1,
        business_date: TODAY,
        status: 'draft',
        cash_receipt_total: 15800,
        variance: null,
      },
    ],
  })
  apiMocks.getFeePeriods.mockResolvedValue(['115-1', '114-2'])
  apiMocks.getFeeSummary.mockResolvedValue({
    total_count: 190,
    unpaid_count: 40,
    partial_count: 5,
    total_unpaid: 480000,
  })
  apiMocks.getClosePeriods.mockResolvedValue({ total: 0, items: [] })
  apiMocks.getBillSlipBatches.mockResolvedValue([])
  apiMocks.getCollectionPayments.mockResolvedValue({ total: 0 })
})

describe('FeeWorkbench 工作佇列', () => {
  it('載入中顯示 skeleton，完成後顯示七列佇列', async () => {
    const wrapper = mountWorkbench()
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(true)
    await flushAll()
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(false)
    expect(wrapper.findAll('.queue-row')).toHaveLength(7)
  })

  it('每個統計 API 只呼叫一次（不因佇列渲染重複請求）', async () => {
    mountWorkbench()
    await flushAll()
    expect(apiMocks.getCloseSummary).toHaveBeenCalledTimes(1)
    expect(apiMocks.getCashHandovers).toHaveBeenCalledTimes(1)
    expect(apiMocks.getFeePeriods).toHaveBeenCalledTimes(1)
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(1)
    expect(apiMocks.getClosePeriods).toHaveBeenCalledTimes(1)
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledTimes(1)
  })

  it('待處理項目排在最前，且金額大者優先', async () => {
    const wrapper = mountWorkbench()
    await flushAll()
    const rows = wrapper.findAll('.queue-row')
    const keys = rows.map((r) => r.attributes('data-test'))
    // 待處理依金額大到小：費用單 480,000 → 交接 15,800 → 存摺 10,800
    // → 退款（無金額語意，權重 1）→ 關帳（無金額，0）
    expect(keys.slice(0, 5)).toEqual([
      'workbench-row-receivable',
      'workbench-row-handover',
      'workbench-row-passbook',
      'workbench-row-refunds',
      'workbench-row-close',
    ])
    expect(rows.slice(0, 5).every((r) => r.classes('queue-row--action'))).toBe(true)
    expect(rows.slice(5).some((r) => r.classes('queue-row--action'))).toBe(false)
  })

  it('可靠數據可得時顯示實際計數與金額', async () => {
    const wrapper = mountWorkbench()
    await flushAll()
    const text = wrapper.text()
    expect(text).toContain('存摺交易 3 筆待分類')
    expect(text).toContain('NT$10,800')
    expect(text).toContain('今日現金 NT$15,800 尚未提交交接')
    expect(text).toContain('預繳退款 2 筆待處理')
    expect(text).toContain('本月關帳有 3 項檢查未通過')
    expect(text).toContain('45 筆未收齊')
    expect(text).toContain('NT$480,000')
  })

  it('點擊行動導向對應工作區（emit navigate）', async () => {
    const wrapper = mountWorkbench()
    await flushAll()
    await wrapper.find('[data-test="workbench-action-passbook"]').trigger('click')
    await wrapper.find('[data-test="workbench-action-handover"]').trigger('click')
    await wrapper.find('[data-test="workbench-action-refunds"]').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([
      [{ ws: 'billing', view: 'matching', src: 'passbook' }],
      [{ ws: 'settlement', view: 'handover' }],
      [{ ws: 'billing', view: 'refunds' }],
    ])
  })

  it('整列可點（點擊列本身即導航，不必命中小按鈕）', async () => {
    const wrapper = mountWorkbench()
    await flushAll()
    await wrapper.find('[data-test="workbench-row-receivable"] button').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual([
      { ws: 'billing', view: 'receivable' },
    ])
  })

  it('統計 API 失敗時降級：不顯示數字、保留狀態說明與入口', async () => {
    apiMocks.getCloseSummary.mockRejectedValue(new Error('403'))
    apiMocks.getCashHandovers.mockRejectedValue(new Error('network'))
    const wrapper = mountWorkbench()
    await flushAll()
    const text = wrapper.text()
    expect(text).toContain('無法載入本月統計')
    expect(text).toContain('無法載入交接狀態')
    expect(text).not.toContain('NT$10,800')
    // 入口仍在
    expect(wrapper.find('[data-test="workbench-action-passbook"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="workbench-action-handover"]').exists()).toBe(true)
  })

  it('空資料狀態說明下一步：尚無費用單時導向費用設定（產單已改每日排程自動化）', async () => {
    apiMocks.getFeePeriods.mockResolvedValue([])
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('尚未產生任何費用單')
    expect(wrapper.text()).toContain('自動產生')
    expect(wrapper.text()).toContain('去設定')
    expect(apiMocks.getFeeSummary).not.toHaveBeenCalled()
  })

  it('本月已關帳時顯示完成狀態', async () => {
    apiMocks.getClosePeriods.mockResolvedValue({
      total: 1,
      items: [{ close_year: 2026, close_month: 8, status: 'closed' }],
    })
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('本月已關帳')
  })

  it('今日無現金收款時顯示無待辦狀態（不虛構批次）', async () => {
    apiMocks.getCashHandovers.mockResolvedValue({ total: 0, items: [] })
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('今日尚無現金收款')
  })
})

describe('FeeWorkbench 代收明細待媒合（SPEC-016）', () => {
  it('有待媒合時顯示筆數並導向入帳媒合（代收來源）', async () => {
    apiMocks.getCollectionPayments.mockResolvedValue({ total: 7 })
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('代收明細 7 筆待媒合')
    await wrapper.find('[data-test="workbench-action-collection"]').trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual([
      { ws: 'billing', view: 'matching', src: 'collection' },
    ])
  })

  it('載入失敗時降級為狀態未知並保留入口', async () => {
    apiMocks.getCollectionPayments.mockRejectedValue(new Error('403'))
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('無法載入代收明細')
    expect(wrapper.find('[data-test="workbench-action-collection"]').exists()).toBe(true)
  })
})

describe('FeeWorkbench 發單批次產單卡（SPEC-018）', () => {
  const SLIP = {
    id: 7,
    net_total: 2148669,
    records_generated_count: 0,
  }

  it('有批次未產單時顯示待處理並導向發單批次抽屜', async () => {
    apiMocks.getBillSlipBatches.mockResolvedValue([
      SLIP,
      { id: 8, net_total: 1775200, records_generated_count: 119 },
    ])
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('發單批次尚未產生費用單')
    expect(wrapper.text()).toContain('1 個批次已匯入')
    await wrapper.find('[data-test="workbench-action-billslips"]').trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual([
      { ws: 'billing', view: 'receivable', imports: true },
    ])
  })

  it('批次皆已產單時顯示完成', async () => {
    apiMocks.getBillSlipBatches.mockResolvedValue([
      { id: 8, net_total: 1775200, records_generated_count: 119 },
    ])
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('發單批次皆已產生費用單')
  })

  it('尚無批次時引導匯入檢核檔（不虛構數字）', async () => {
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('尚無發單批次')
    expect(wrapper.text()).toContain('檢核檔')
  })

  it('載入失敗時降級為狀態未知並保留入口', async () => {
    apiMocks.getBillSlipBatches.mockRejectedValue(new Error('403'))
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('無法載入發單批次')
    expect(wrapper.find('[data-test="workbench-action-billslips"]').exists()).toBe(true)
  })
})
