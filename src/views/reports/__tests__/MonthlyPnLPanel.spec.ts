import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// 契約參照 src/api/reports.ts getMonthlyPnL：api.get(...).then(r => r.data)
// 故此處 mock 直接回傳「已解包」的物件（非 { data: ... }）
vi.mock('@/api/reports', () => ({
  getMonthlyPnL: vi.fn(),
}))

import MonthlyPnLPanel from '@/views/reports/MonthlyPnLPanel.vue'
import { getMonthlyPnL } from '@/api/reports'

type Cells = (number | null)[]

// 固定今天＝2026-07-10：1–6 月為過去、7 月為本月、8–12 月為未來
// 資料從 3 月才開始（1、2 月屬「系統開始記帳前」）
const TUITION: Cells = [0, 0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]
const CUMULATIVE: Cells = [0, 0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]
const ZEROS: Cells = Array(12).fill(0)

function makePnl() {
  return {
    sections: [
      {
        key: 'income',
        label: '收入',
        rows: [
          { key: 'tuition', label: '學費', unit: 'amount', monthly: TUITION, total: 10000 },
          { key: 'graduation', label: '畢冊費', unit: 'amount', monthly: ZEROS, total: 0 },
          { key: 'income_subtotal', label: '收入小計', unit: 'amount', is_subtotal: true, monthly: TUITION, total: 10000 },
        ],
      },
      {
        key: 'expense',
        label: '支出',
        rows: [
          { key: 'rent', label: '租金', unit: 'amount', monthly: ZEROS, total: 0 },
          { key: 'water', label: '水費', unit: 'amount', monthly: ZEROS, total: 0 },
          { key: 'expense_subtotal', label: '支出小計', unit: 'amount', is_subtotal: true, monthly: ZEROS, total: 0 },
        ],
      },
      {
        key: 'stats',
        label: '統計指標',
        rows: [
          { key: 'student_count', label: '在籍學生', unit: 'person', monthly: Array(12).fill(30), total: 30 },
          // 全年為 0 的統計指標不可被隱藏
          { key: 'class_count', label: '班級數', unit: 'class', monthly: ZEROS, total: 0 },
        ],
      },
    ],
    totals: {
      income_total: { monthly: TUITION, total: 10000 },
      refund_total: { monthly: ZEROS, total: 0 },
      expense_total: { monthly: ZEROS, total: 0 },
      net_cashflow: { monthly: TUITION, total: 10000 },
      // 累計淨現金＝net_cashflow 逐月累計；後端會一路延伸到 12 月，前端未來月要留白
      cumulative_net: { monthly: CUMULATIVE, total: 10000 },
    },
    // pending_items 含收入類（畢冊、預繳）與支出類項目，驗證雙通道引導
    pending_items: ['畢冊費 3 筆待登錄', '預繳學費 2 筆待登錄', '廠商水電費 1 筆待登錄'],
  }
}

function mountPanel(props: { year?: number; focusMonth?: number } = {}) {
  return mount(MonthlyPnLPanel, {
    props: { year: 2026, focusMonth: 7, ...props },
    global: {
      plugins: [ElementPlus],
      stubs: { 'router-link': RouterLinkStub },
    },
  })
}

async function mountLoaded(props: { year?: number; focusMonth?: number } = {}) {
  const w = mountPanel(props)
  await flushPromises()
  return w
}

function cellTexts(w: Awaited<ReturnType<typeof mountLoaded>>, rowKey: string): string[] {
  return w.findAll(`[data-row-key="${rowKey}"] td.cell-num`).map(c => c.text())
}

beforeEach(() => {
  // 只假造 Date，避免干擾 flushPromises 與 Element Plus 的計時器
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 10))
  vi.mocked(getMonthlyPnL).mockReset()
  vi.mocked(getMonthlyPnL).mockResolvedValue(makePnl())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('隱藏全年為 0 的列', () => {
  it('預設隱藏全年為 0 的金額列，並在該段末端、小計之前列出被隱藏的科目', async () => {
    const w = await mountLoaded()
    expect(w.find('[data-row-key="tuition"]').exists()).toBe(true)
    expect(w.find('[data-row-key="graduation"]').exists()).toBe(false)

    const note = w.find('[data-test="hidden-note-income"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('已隱藏 1 列全年為 0：畢冊費')

    // 提示列在小計列之前
    const keys = w.findAll('tbody tr').map(tr => tr.attributes('data-row-key') ?? tr.attributes('data-test'))
    expect(keys.indexOf('hidden-note-income')).toBeGreaterThan(keys.indexOf('tuition'))
    expect(keys.indexOf('hidden-note-income')).toBeLessThan(keys.indexOf('income_subtotal'))

    // 工具列總計：income 1 列 + expense 整段 2 列
    expect(w.find('[data-test="pnl-hidden-count"]').text()).toBe('（已隱藏 3 列）')
  })

  it('統計指標（人／班）即使全年為 0 也不隱藏', async () => {
    const w = await mountLoaded()
    expect(w.find('[data-row-key="class_count"]').exists()).toBe(true)
    expect(w.find('[data-row-key="student_count"]').exists()).toBe(true)
  })

  it('關掉開關後被隱藏的列全部出現，提示與計數消失', async () => {
    const w = await mountLoaded()
    await w.find('[data-test="hide-zero-switch"]').trigger('click')
    expect(w.find('[data-row-key="graduation"]').exists()).toBe(true)
    expect(w.find('[data-row-key="rent"]').exists()).toBe(true)
    expect(w.find('[data-test="hidden-note-income"]').exists()).toBe(false)
    expect(w.find('[data-test="pnl-hidden-count"]').exists()).toBe(false)
  })

  it('點提示列的「顯示」會把開關關掉', async () => {
    const w = await mountLoaded()
    await w.find('[data-test="show-hidden-rows"]').trigger('click')
    expect(w.find('[data-row-key="graduation"]').exists()).toBe(true)
  })

  it('整段金額列全為 0：收成一行，小計列也不顯示；「展開」可還原', async () => {
    const w = await mountLoaded()
    const collapsed = w.find('[data-test="section-collapsed-expense"]')
    expect(collapsed.exists()).toBe(true)
    expect(collapsed.text()).toContain('2 個科目全年為 0')
    expect(w.find('[data-row-key="rent"]').exists()).toBe(false)
    expect(w.find('[data-row-key="water"]').exists()).toBe(false)
    expect(w.find('[data-row-key="expense_subtotal"]').exists()).toBe(false)
    // 段標題仍在
    expect(w.text()).toContain('支出')

    await w.find('[data-test="expand-section"]').trigger('click')
    expect(w.find('[data-test="section-collapsed-expense"]').exists()).toBe(false)
    expect(w.find('[data-row-key="rent"]').exists()).toBe(true)
    expect(w.find('[data-row-key="expense_subtotal"]').exists()).toBe(true)
  })

  it('沒有任何全年為 0 的列時，不出現提示與計數', async () => {
    const pnl = makePnl()
    pnl.sections = pnl.sections.filter(s => s.key === 'stats')
    vi.mocked(getMonthlyPnL).mockResolvedValue(pnl)
    const w = await mountLoaded()
    expect(w.find('[data-test="pnl-hidden-count"]').exists()).toBe(false)
    expect(w.find('.row-note').exists()).toBe(false)
  })
})

describe('欄位狀態（過去／本月／未來／記帳前）', () => {
  it('7 月欄 col-current、8 月起 col-future', async () => {
    const w = await mountLoaded()
    const headers = w.findAll('thead th.col-month')
    expect(headers[6].classes()).toContain('col-current')
    expect(headers[7].classes()).toContain('col-future')
    expect(headers[5].classes()).not.toContain('col-future')
  })

  it('未來月金額格留白（不顯示「—」），統計指標列照常顯示', async () => {
    const w = await mountLoaded()
    const tuition = cellTexts(w, 'tuition')
    expect(tuition[6]).toBe('1,000') // 本月
    expect(tuition[7]).toBe('')
    expect(tuition[11]).toBe('')
    // 統計指標列在未來月仍顯示數字
    expect(cellTexts(w, 'student_count')[8]).toBe('30 人')
  })

  it('累計淨現金不延伸到未來月：8–12 月留白，7 月仍有值，合計欄＝截止月累計', async () => {
    const w = await mountLoaded()
    const cum = cellTexts(w, 'cumulative_net')
    expect(cum).toHaveLength(13)
    expect(cum[6]).toBe('5,000')
    for (let i = 7; i <= 11; i++) expect(cum[i]).toBe('')
    // 合計欄與月欄一致：後端全年值 10,000 含未來月預登錄，畫面只顯示截至 7 月的 5,000
    expect(cum[12]).toBe('5,000')
  })

  it('其他合計列的未來月同樣留白', async () => {
    const w = await mountLoaded()
    expect(cellTexts(w, 'income_total')[8]).toBe('')
    expect(cellTexts(w, 'net_cashflow')[8]).toBe('')
  })

  it('年度第一個有收支月份之前：該欄灰底、金額格為淡色「—」，統計指標列照常顯示', async () => {
    const w = await mountLoaded()
    const headers = w.findAll('thead th.col-month')
    expect(headers[0].classes()).toContain('col-nodata')
    expect(headers[1].classes()).toContain('col-nodata')
    expect(headers[2].classes()).not.toContain('col-nodata') // 3 月起有資料

    const firstCell = w.findAll('[data-row-key="tuition"] td.cell-num')[0]
    expect(firstCell.text()).toBe('—')
    expect(firstCell.classes()).toContain('col-nodata')
    expect(firstCell.classes()).toContain('cell-faint')
    expect(cellTexts(w, 'income_total')[1]).toBe('—')
    expect(cellTexts(w, 'student_count')[0]).toBe('30 人')
  })

  it('結餘列只在已發生且有紀錄的月份上紅綠色；未來月與記帳前中性', async () => {
    const w = await mountLoaded()
    const cells = w.findAll('[data-row-key="net_cashflow"] td.cell-num')
    expect(cells[6].classes()).toContain('cell-positive')
    expect(cells[7].classes()).not.toContain('cell-positive')
    expect(cells[7].classes()).toContain('col-future')
    expect(cells[0].classes()).not.toContain('cell-positive')
  })

  it('結餘為負時顯示負號（不只靠顏色）並上紅色', async () => {
    const pnl = makePnl()
    const net = [...TUITION]
    net[3] = -2500
    pnl.totals.net_cashflow = { monthly: net, total: 7500 }
    vi.mocked(getMonthlyPnL).mockResolvedValue(pnl)
    const w = await mountLoaded()
    const cell = w.findAll('[data-row-key="net_cashflow"] td.cell-num')[3]
    expect(cell.text()).toMatch(/^[-−]2,500$/)
    expect(cell.classes()).toContain('cell-negative')
  })

  it('過去年度：沒有未來月，累計淨現金 12 個月都有值', async () => {
    const w = await mountLoaded({ year: 2025 })
    expect(w.findAll('thead th.col-future')).toHaveLength(0)
    expect(w.findAll('thead th.col-current')).toHaveLength(0)
    const cum = cellTexts(w, 'cumulative_net')
    expect(cum[11]).toBe('10,000')
    expect(cum[2]).toBe('1,000')
  })
})

describe('合計五列（tfoot）', () => {
  it('收入／退款／支出合計、結餘、累計淨現金依序放在 tfoot', async () => {
    const w = await mountLoaded()
    const keys = w.findAll('tfoot tr').map(tr => tr.attributes('data-row-key'))
    expect(keys).toEqual(['income_total', 'refund_total', 'expense_total', 'net_cashflow', 'cumulative_net'])
    expect(w.find('tbody [data-row-key="income_total"]').exists()).toBe(false)
  })

  it('合計欄與已發生月份的數字正確', async () => {
    const w = await mountLoaded()
    const income = cellTexts(w, 'income_total')
    expect(income[2]).toBe('1,000')
    // 合計只加到本月（未來月預登錄不計入；後端 total 為 10,000）
    expect(income[12]).toBe('5,000')
    expect(w.find('[data-row-key="cumulative_net"]').text()).toContain('累計淨現金')
  })
})

describe('月份焦點', () => {
  it('點表頭月份 emit update:focusMonth', async () => {
    const w = await mountLoaded()
    await w.find('[data-test="month-btn-3"]').trigger('click')
    expect(w.emitted('update:focusMonth')).toEqual([[3]])
  })

  it('表頭月份是 button，鍵盤可及', async () => {
    const w = await mountLoaded()
    const btn = w.find('[data-test="month-btn-5"]')
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.attributes('type')).toBe('button')
  })

  it('焦點月（與本月不同）表頭加 col-focus，且按鈕標 aria-current', async () => {
    const w = await mountLoaded({ focusMonth: 3 })
    const headers = w.findAll('thead th.col-month')
    expect(headers[2].classes()).toContain('col-focus')
    expect(headers[3].classes()).not.toContain('col-focus')
    expect(w.find('[data-test="month-btn-3"]').attributes('aria-current')).toBe('true')
    expect(w.find('[data-test="month-btn-4"]').attributes('aria-current')).toBeUndefined()
  })

  it('焦點月與本月相同時沿用本月高亮，不再加 col-focus', async () => {
    const w = await mountLoaded({ focusMonth: 7 })
    const header = w.findAll('thead th.col-month')[6]
    expect(header.classes()).toContain('col-current')
    expect(header.classes()).not.toContain('col-focus')
  })

  it('焦點月改變不重新載入資料', async () => {
    const w = await mountLoaded({ focusMonth: 7 })
    await w.setProps({ focusMonth: 2 })
    await flushPromises()
    expect(vi.mocked(getMonthlyPnL)).toHaveBeenCalledTimes(1)
    expect(w.findAll('thead th.col-month')[1].classes()).toContain('col-focus')
  })
})

describe('工具列與面板內容', () => {
  it('不再有匯出與「跳到本月」按鈕（改由頁首負責）', async () => {
    const w = await mountLoaded()
    expect(w.find('[data-test="pnl-export"]').exists()).toBe(false)
    expect(w.find('[data-test="jump-to-current"]').exists()).toBe(false)
    expect(w.findAll('button').some(b => b.text().includes('匯出'))).toBe(false)
    expect(w.findAll('button').some(b => b.text().includes('跳到本月'))).toBe(false)
  })

  it('工具列有隱藏開關（預設開）與圖例', async () => {
    const w = await mountLoaded()
    expect(w.text()).toContain('隱藏全年為 0 的列')
    expect(w.find('[data-test="hide-zero-switch"]').classes()).toContain('is-checked')
    expect(w.find('[data-test="pnl-legend"]').text()).toBe('灰底＝系統開始記帳前　藍底＝本月（進行中）　空白＝未來月　合計只算到本月')
  })
})

describe('註腳：還沒算進本表的項目', () => {
  it('標題、副標與 pending_items 逐條列出', async () => {
    const w = await mountLoaded()
    const pending = w.find('[data-test="pnl-pending"]')
    expect(pending.exists()).toBe(true)
    expect(pending.text()).toContain('還沒算進本表的項目')
    expect(pending.text()).toContain('要在「收付款管理」登錄後才會出現')
    const items = pending.findAll('li').map(li => li.text())
    expect(items).toEqual(['畢冊費 3 筆待登錄', '預繳學費 2 筆待登錄', '廠商水電費 1 筆待登錄'])
  })

  it('同時含「雜項收款」(收入) 與「廠商付款」(支出) 雙通道連結，且路由 query 正確', async () => {
    const w = await mountLoaded()
    const links = w.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(2)
    const miscLink = links.find(l => (l.props('to') as { query?: { tab?: string } })?.query?.tab === 'misc')
    const vendorLink = links.find(l => (l.props('to') as { query?: { tab?: string } })?.query?.tab === 'vendor')
    expect(miscLink?.text()).toBe('雜項收款')
    expect(vendorLink?.text()).toBe('廠商付款')
    expect((miscLink?.props('to') as { path?: string })?.path).toBe('/finance-signoffs')
    expect((vendorLink?.props('to') as { path?: string })?.path).toBe('/finance-signoffs')
  })

  it('沒有 pending_items 時不顯示註腳', async () => {
    const pnl = makePnl()
    pnl.pending_items = []
    vi.mocked(getMonthlyPnL).mockResolvedValue(pnl)
    const w = await mountLoaded()
    expect(w.find('[data-test="pnl-pending"]').exists()).toBe(false)
  })
})

describe('載入／錯誤／空資料狀態', () => {
  it('載入中顯示 skeleton', () => {
    vi.mocked(getMonthlyPnL).mockReturnValue(new Promise(() => {}))
    const w = mountPanel()
    expect(w.find('.el-skeleton').exists()).toBe(true)
    expect(w.find('table').exists()).toBe(false)
  })

  it('載入失敗顯示錯誤並可重新載入', async () => {
    vi.mocked(getMonthlyPnL).mockRejectedValueOnce(new Error('boom'))
    const w = await mountLoaded()
    expect(w.find('[data-test="pnl-error"]').exists()).toBe(true)
    expect(w.find('table').exists()).toBe(false)

    await w.find('[data-test="pnl-reload"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(getMonthlyPnL)).toHaveBeenCalledTimes(2)
    expect(w.find('table').exists()).toBe(true)
  })

  it('此年度沒有任何列時顯示空資料文案', async () => {
    vi.mocked(getMonthlyPnL).mockResolvedValue({ sections: [], totals: {}, pending_items: [] })
    const w = await mountLoaded()
    expect(w.text()).toContain('此年度尚無現金收支資料')
    expect(w.find('table').exists()).toBe(false)
  })
})

describe('monthlyPnlExportUrl 契約', () => {
  it('真實實作產生正確端點路徑（匯出改由頁首使用，抄真實契約防 mock 假綠）', async () => {
    const actual = await vi.importActual<typeof import('@/api/reports')>('@/api/reports')
    expect(actual.monthlyPnlExportUrl(2026)).toBe('/reports/monthly-pnl/export?year=2026')
  })
})
