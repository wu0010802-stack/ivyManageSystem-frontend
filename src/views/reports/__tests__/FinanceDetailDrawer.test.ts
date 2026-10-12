import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const { detailMock } = vi.hoisted(() => ({ detailMock: vi.fn() }))
vi.mock('@/api/reports', () => ({
  getFinanceSummaryDetail: (...a: unknown[]) => detailMock(...a),
  financeSummaryExportUrl: (y: number, m?: number) => `/reports/finance-summary/export?year=${y}&month=${m}`,
}))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn().mockResolvedValue(undefined) }))

import { downloadFile } from '@/utils/download'
import FinanceDetailDrawer from '@/views/reports/FinanceDetailDrawer.vue'

function detail() {
  return {
    period: { year: 2026, month: 9 },
    tuition: [
      { kind: 'payment', date: '2026-09-01', amount: 11290, student_name: '學生甲', classroom_name: '茉莉班', fee_item_name: '9 月繳費單', payment_method: '轉帳' },
      { kind: 'payment', date: '2026-09-02', amount: 10800, student_name: '學生乙', classroom_name: '百合班', fee_item_name: '9 月繳費單', payment_method: 'cash' },
      { kind: 'refund', date: '2026-09-05', amount: 23000, student_name: '學生丙', reason: '退學' },
    ],
    activity: [], misc_receipt: [], salary: [], vendor_payment: [], fixed_cost: [],
    collection_fee: [{ date: '2026-09-01', channel: '統一', gross_amount: 10800, amount: 2 }],
    year_end: [], extra_bonus: [],
  }
}

function mountDrawer(props: Record<string, unknown> = {}) {
  return mount(FinanceDetailDrawer, {
    props: { modelValue: false, year: 2026, month: 9, initialGroup: 'revenue', totals: { revenue: 22090, refund: 23000, expense: 2 }, ...props },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

beforeEach(() => {
  detailMock.mockReset()
  detailMock.mockResolvedValue({ data: detail() })
  document.body.innerHTML = ''
})

const q = (sel: string) => document.body.querySelector(sel)
const qa = (sel: string) => [...document.body.querySelectorAll(sel)]

describe('FinanceDetailDrawer', () => {
  it('開啟才載入；只列有資料的分類籤（含退款與代收手續費）', async () => {
    const w = mountDrawer()
    expect(detailMock).not.toHaveBeenCalled()
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(detailMock).toHaveBeenCalledWith(2026, 9)
    const chips = qa('[data-test^="chip-"]').map(e => e.textContent?.trim())
    expect(chips).toEqual(['學費 2', '退款 1', '代收手續費 1'])
    w.unmount()
  })

  it('預設選指定組別第一個分類；小計含付款方式中文拆分', async () => {
    const w = mountDrawer()
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(q('[data-test="chip-tuition"]')?.classList.contains('is-on')).toBe(true)
    const sub = q('[data-test="detail-subtotal"]')?.textContent ?? ''
    expect(sub).toContain('學費 · 2 筆 · 合計 22,090')
    expect(sub).toContain('轉帳 11,290')
    expect(sub).toContain('現金 10,800')
    w.unmount()
  })

  it('從支出點進來預設選代收手續費', async () => {
    const w = mountDrawer({ initialGroup: 'expense' })
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(q('[data-test="chip-collection_fee"]')?.classList.contains('is-on')).toBe(true)
    expect(q('[data-test="detail-subtotal"]')?.textContent).toContain('代收手續費 · 1 筆 · 合計 2')
    w.unmount()
  })

  it('頂部顯示該月收入／退款／支出（與表格同一來源）', async () => {
    const w = mountDrawer()
    await w.setProps({ modelValue: true })
    await flushPromises()
    const text = q('[data-test="finance-detail-drawer"]')?.textContent ?? document.body.textContent ?? ''
    expect(text).toContain('22,090')
    expect(text).toContain('23,000')
    w.unmount()
  })

  it('載入失敗顯示錯誤與重新載入', async () => {
    detailMock.mockRejectedValueOnce(new Error('boom'))
    const w = mountDrawer()
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(document.body.textContent).toContain('重新載入')
    w.unmount()
  })

  it('匯出本月帶月份參數', async () => {
    const w = mountDrawer()
    await w.setProps({ modelValue: true })
    await flushPromises()
    ;(q('[data-test="detail-export"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith('/reports/finance-summary/export?year=2026&month=9', '收支彙總_2026-09.xlsx')
    w.unmount()
  })
})
