import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// 契約參照 src/api/reports.ts getMonthlyPnL：api.get(...).then(r => r.data)
// 故此處 mock 直接回傳「已解包」的物件（非 { data: ... }）
vi.mock('@/api/reports', () => ({
  getMonthlyPnL: vi.fn().mockResolvedValue({
    sections: [
      {
        key: 'income',
        label: '收入',
        rows: [
          { key: 'tuition', label: '學費', unit: 'amount', monthly: Array(12).fill(1000), total: 12000 },
        ],
      },
    ],
    totals: {
      income_total: { monthly: Array(12).fill(1000), total: 12000 },
      refund_total: { monthly: Array(12).fill(0), total: 0 },
      expense_total: { monthly: Array(12).fill(0), total: 0 },
      net_cashflow: { monthly: Array(12).fill(1000), total: 12000 },
    },
    // pending_items 含收入類（畢冊、預繳）與支出類項目，驗證雙通道引導
    pending_items: ['畢冊費 3 筆待登錄', '預繳學費 2 筆待登錄', '廠商水電費 1 筆待登錄'],
  }),
}))

import MonthlyPnLPanel from '@/views/reports/MonthlyPnLPanel.vue'

function mountPanel() {
  return mount(MonthlyPnLPanel, {
    props: { year: 2026 },
    global: {
      plugins: [ElementPlus],
      stubs: { 'router-link': RouterLinkStub },
    },
  })
}

describe('MonthlyPnLPanel pending 提醒引導', () => {
  it('提醒同時含「雜項收款」(收入) 與「廠商付款」(支出) 雙通道連結，且路由 query 正確', async () => {
    const w = mountPanel()
    await flushPromises()

    const text = w.text()
    expect(text).toContain('雜項收款')
    expect(text).toContain('廠商付款')

    const links = w.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(2)

    const miscLink = links.find((l) => (l.props('to') as { query?: { tab?: string } })?.query?.tab === 'misc')
    const vendorLink = links.find((l) => (l.props('to') as { query?: { tab?: string } })?.query?.tab === 'vendor')

    expect(miscLink).toBeTruthy()
    expect(vendorLink).toBeTruthy()
    expect((miscLink?.props('to') as { path?: string })?.path).toBe('/finance-signoffs')
    expect((vendorLink?.props('to') as { path?: string })?.path).toBe('/finance-signoffs')
  })

  it('pending_items 清單項目仍逐條列出', async () => {
    const w = mountPanel()
    await flushPromises()

    expect(w.text()).toContain('畢冊費 3 筆待登錄')
    expect(w.text()).toContain('廠商水電費 1 筆待登錄')
  })
})

describe('當月高亮與未來月淡化（spec §6）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 10))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('檢視今年：7 月欄 col-current、8 月起 col-future', async () => {
    const w = mountPanel() // year: 2026
    await flushPromises()
    const headers = w.findAll('thead th.col-month')
    expect(headers[6].classes()).toContain('col-current')
    expect(headers[7].classes()).toContain('col-future')
    expect(headers[5].classes()).not.toContain('col-future')
  })
  it('未來月的結餘 cell 不上紅綠色（中性）', async () => {
    const w = mountPanel()
    await flushPromises()
    const netRow = w.find('[data-row-key="net_cashflow"]')
    const cells = netRow.findAll('td.cell-num')
    // mock 全年 monthly 皆 1000（正值）：7 月內上綠、8 月起中性
    expect(cells[6].classes()).toContain('cell-positive')
    expect(cells[7].classes()).not.toContain('cell-positive')
    expect(cells[7].classes()).toContain('col-future')
  })
  it('檢視今年顯示「跳到本月」按鈕；過去年不顯示', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(w.find('[data-test="jump-to-current"]').exists()).toBe(true)
    const past = mount(MonthlyPnLPanel, { props: { year: 2020 }, global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } } })
    await flushPromises()
    expect(past.find('[data-test="jump-to-current"]').exists()).toBe(false)
  })
})
