/**
 * 工作台測試：佇列項目的狀態/計數/導航、以及 API 失敗時的
 * 「不顯示假數字、只留狀態與入口」降級行為。
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
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
}

const flushAll = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import FeeWorkbench from '../FeeWorkbench.vue'

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
})

describe('FeeWorkbench 工作佇列', () => {
  it('載入中顯示 skeleton，完成後顯示五列佇列', async () => {
    const wrapper = mountWorkbench()
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(true)
    await flushAll()
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(false)
    const rows = wrapper.findAll('.queue-row')
    expect(rows).toHaveLength(5)
  })

  it('每個統計 API 只呼叫一次（不因佇列渲染重複請求）', async () => {
    mountWorkbench()
    await flushAll()
    expect(apiMocks.getCloseSummary).toHaveBeenCalledTimes(1)
    expect(apiMocks.getCashHandovers).toHaveBeenCalledTimes(1)
    expect(apiMocks.getFeePeriods).toHaveBeenCalledTimes(1)
    expect(apiMocks.getFeeSummary).toHaveBeenCalledTimes(1)
    expect(apiMocks.getClosePeriods).toHaveBeenCalledTimes(1)
  })

  it('可靠數據可得時顯示實際計數與金額', async () => {
    const wrapper = mountWorkbench()
    await flushAll()
    const text = wrapper.text()
    expect(text).toContain('3 筆交易待媒合或分類')
    expect(text).toContain('NT$10,800')
    expect(text).toContain('今日已收現金 NT$15,800，尚未提交交接')
    expect(text).toContain('2 筆預繳退款待核准或交付現金')
    expect(text).toContain('3 項關帳前檢查未通過')
    expect(text).toContain('45 筆未收齊')
    expect(text).toContain('NT$480,000')
  })

  it('點擊行動導向對應工作區（emit navigate）', async () => {
    const wrapper = mountWorkbench()
    await flushAll()
    await wrapper.find('[data-test="workbench-action-recon"]').trigger('click')
    await wrapper.find('[data-test="workbench-action-handover"]').trigger('click')
    await wrapper.find('[data-test="workbench-action-refunds"]').trigger('click')
    const events = wrapper.emitted('navigate')
    expect(events).toEqual([
      [{ ws: 'recon' }],
      [{ ws: 'settlement', view: 'handover' }],
      [{ ws: 'billing', view: 'prepayments' }],
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
    expect(wrapper.find('[data-test="workbench-action-recon"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="workbench-action-handover"]').exists()).toBe(true)
  })

  it('空資料狀態說明下一步：尚無費用單時導向費用設定（產單已改每日排程自動化）', async () => {
    apiMocks.getFeePeriods.mockResolvedValue([])
    const wrapper = mountWorkbench()
    await flushAll()
    expect(wrapper.text()).toContain('尚未產生任何費用單')
    expect(wrapper.text()).toContain('自動產生')
    expect(wrapper.text()).toContain('前往費用設定')
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
