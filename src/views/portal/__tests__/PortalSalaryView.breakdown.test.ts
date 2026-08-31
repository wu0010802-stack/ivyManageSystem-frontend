import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * PortalSalaryView 三區明細契約測試（2026-08-24）。
 *
 * 背景：後端 /portal/salary-preview 的 salary 早已改走 build_history_breakdown
 * 三區明細（income/deductions/separate_transfer 為 {key,label,amount} 陣列），
 * 但本頁一直讀 flat 欄位（salary.base_salary / total_bonus / labor_insurance…），
 * 真實資料下整頁明細恆顯示 0、只有實發金額正確。mock 形狀逐字抄自後端契約測試
 * （ivy-backend tests/test_portal_response_model_contracts.py 與
 * schemas/portal_salary.py::PortalSalaryDetailOut）。
 */

const { mockPreview } = vi.hoisted(() => ({ mockPreview: vi.fn() }))

vi.mock('@/api/portal', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, getSalaryPreview: mockPreview }
})

vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }),
}))

import PortalSalaryView from '@/views/portal/PortalSalaryView.vue'

const FINALIZED_RESPONSE = {
  year: 2026,
  month: 7,
  attendance_stats: {
    work_days: 22,
    late_count: 1,
    early_leave_count: 0,
    missing_punch_count: 0,
    leave_hours: 8,
    leave_days: 1,
  },
  salary_status: 'finalized',
  salary: {
    income: [
      { key: 'base_salary', label: '底薪', amount: 32000 },
      { key: 'performance_bonus', label: '績效獎金', amount: 0 },
      { key: 'extra_allowance', label: '額外加給', amount: 1000, note: '交通津貼' },
      { key: 'other_income', label: '其他（未分類）', amount: 500 },
    ],
    income_subtotal: 33500,
    separate_transfer: [
      { key: 'festival_bonus', label: '節慶獎金', amount: 2000 },
      { key: 'overtime_bonus', label: '超額獎金', amount: 0 },
      { key: 'appraisal_year_end_bonus', label: '考核年終獎金', amount: 0 },
    ],
    separate_subtotal: 2000,
    deductions: [
      { key: 'labor_insurance_employee', label: '勞保', amount: 800 },
      {
        key: 'health_insurance_employee',
        label: '健保',
        amount: 500,
        children: [
          {
            key: 'supplementary_health_employee',
            label: '其中：二代健保補充保費',
            amount: 100,
            informational: true,
          },
        ],
      },
      { key: 'late_deduction', label: '遲到扣款', amount: 0 },
    ],
    deduction_subtotal: 1300,
    net_salary: 32200,
    unused_leave_payout: 0,
    base_transfer_amount: 32200,
    is_finalized: true,
    needs_recalc: false,
    version: 1,
  },
}

async function mountView() {
  const wrapper = mount(PortalSalaryView, {
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

describe('PortalSalaryView 三區明細', () => {
  beforeEach(() => {
    mockPreview.mockReset().mockResolvedValue({ data: FINALIZED_RESPONSE })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('收入區依後端明細列渲染（含 note、隱藏 0 元列）', async () => {
    const wrapper = await mountView()
    const text = wrapper.text()
    expect(text).toContain('底薪')
    expect(text).toContain('32,000')
    expect(text).toContain('額外加給')
    expect(text).toContain('交通津貼')
    expect(text).toContain('其他（未分類）')
    // 0 元列不顯示，避免長串 0 淹沒有效資訊
    expect(text).not.toContain('績效獎金')
    // 應發合計 = income_subtotal
    expect(text).toContain('33,500')
  })

  it('扣款區渲染明細與健保 informational 子列、合計取 deduction_subtotal', async () => {
    const wrapper = await mountView()
    const text = wrapper.text()
    expect(text).toContain('勞保')
    expect(text).toContain('健保')
    expect(text).toContain('其中：二代健保補充保費')
    expect(text).toContain('100')
    expect(text).not.toContain('遲到扣款') // 0 元列不顯示
    expect(text).toContain('1,300') // 扣款合計
  })

  it('獨立轉帳獎金區取 separate_transfer/subtotal（不併入實發）', async () => {
    const wrapper = await mountView()
    const text = wrapper.text()
    expect(text).toContain('節慶獎金')
    expect(text).toContain('2,000')
    expect(text).not.toContain('超額獎金') // 0 元列不顯示
  })

  it('實發金額取後端 base_transfer_amount', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('32,200')
  })

  it('draft 狀態顯示提示、不渲染明細卡', async () => {
    mockPreview.mockResolvedValue({
      data: {
        year: 2026,
        month: 7,
        attendance_stats: FINALIZED_RESPONSE.attendance_stats,
        salary: null,
        salary_status: 'draft',
      },
    })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('薪資草稿尚未結算')
    expect(wrapper.text()).not.toContain('實發金額')
  })
})
