/**
 * FinanceDetailDialog.spec.js
 *
 * 2026-07-05 報表重構：下鑽明細新增「固定支出」分頁（build_finance_detail 已補
 * fixed_cost 欄，見 ivy-backend services/finance_report_service.py）。
 * 2026-07-06 追加：「雜項收款」分頁（misc_receipt 已計入總收入卻無法下鑽的缺口）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, provide, inject } from 'vue'

const { mockGetFinanceSummaryDetail } = vi.hoisted(() => ({
  mockGetFinanceSummaryDetail: vi.fn(),
}))

vi.mock('@/api/reports', () => ({
  getFinanceSummaryDetail: mockGetFinanceSummaryDetail,
}))

import FinanceDetailDialog from '@/views/reports/FinanceDetailDialog.vue'

// ── scoped-slot-aware el-table stub ────────────────────────────────────────
// el-table-column 的內容藏在 `#default="{ row }"` scoped slot，若只用 `ElTable: true`
// 自動 stub 完全不渲染 row 層內容，無法斷言 label 映射/金額格式/狀態 tag。
// 這組 stub 讓 ElTable 逐列 provide row，ElTableColumn inject 後呼叫 scoped slot，
// 使表格 cell 的實際渲染文字可被 w.text() 斷言。
const RowProvider = defineComponent({
  props: ['row'],
  setup(props, { slots }) {
    provide('stub-row', props.row)
    return () => h('div', { class: 'row-stub' }, slots.default?.())
  },
})
const ElTable = defineComponent({
  name: 'ElTable',
  props: ['data'],
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-table-stub' },
        (props.data || []).map((row, i) => h(RowProvider, { row, key: i }, () => slots.default?.())),
      )
  },
})
const ElTableColumn = defineComponent({
  name: 'ElTableColumn',
  props: ['label', 'prop'],
  setup(props, { slots }) {
    return () => {
      const row = inject('stub-row', null)
      return h(
        'span',
        { class: 'cell-stub' },
        slots.default ? slots.default({ row }) : String(row?.[props.prop] ?? ''),
      )
    }
  },
})

const globalConfig = {
  stubs: {
    // 需要用 findAllComponents({name:'ElTabPane'}) 依 name/label prop 斷言，
    // el-dialog/el-tabs 恆渲染子內容即可（v-model 開關邏輯非本測試重點）。
    // 顯式 name（findAllComponents({name:...}) 依此比對，stub key 本身不會自動當 name）
    ElTabPane: { name: 'ElTabPane', template: '<div><slot /></div>', props: ['label', 'name'] },
    ElTabs: { name: 'ElTabs', template: '<div><slot /></div>', props: ['modelValue'] },
    ElTag: { name: 'ElTag', template: '<span class="el-tag-stub"><slot /></span>', props: ['type', 'size'] },
  },
  components: { ElTable, ElTableColumn },
}

function emptyDetail() {
  return { tuition: [], activity: [], misc_receipt: [], salary: [], vendor_payment: [], fixed_cost: [] }
}

// watch([modelValue, year, month]) 只在「變化」時觸發（非 immediate），故先以
// modelValue=false mount，再 setProps 觸發 open，貼近真實使用（對話框預設關閉，
// 使用者點擊才開啟）。
async function mountDialog(detail) {
  mockGetFinanceSummaryDetail.mockResolvedValue({ data: detail })
  const w = mount(FinanceDetailDialog, {
    props: { modelValue: false, year: 2026, month: 5 },
    global: globalConfig,
  })
  await w.setProps({ modelValue: true })
  await flushPromises()
  return w
}

beforeEach(() => {
  mockGetFinanceSummaryDetail.mockReset()
})

describe('FinanceDetailDialog 固定支出下鑽分頁', () => {
  it('開啟時載入 fixed_cost 明細，分頁 label 顯示筆數，類別映射中文', async () => {
    const w = await mountDialog({
      ...emptyDetail(),
      fixed_cost: [
        { year: 2026, month: 5, category: 'rent', amount: 500000, notes: null },
        { year: 2026, month: 5, category: 'old_pension_reserve', amount: 10000, notes: '備註' },
      ],
    })

    expect(mockGetFinanceSummaryDetail).toHaveBeenCalledWith(2026, 5)
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    const fixedCostPane = panes.find(p => p.props('name') === 'fixed_cost')
    expect(fixedCostPane).toBeTruthy()
    expect(fixedCostPane.props('label')).toBe('固定支出 (2)')
    // 8 類 label 映射（rent → 租金、old_pension_reserve → 舊制勞退準備金）
    expect(fixedCostPane.text()).toContain('租金')
    expect(fixedCostPane.text()).toContain('舊制勞退準備金')
    // 金額走 money()
    expect(fixedCostPane.text()).toContain('NT$500,000')
  })
})

describe('FinanceDetailDialog 雜項收款下鑽分頁', () => {
  it('渲染 misc_receipt 明細：分頁筆數、類別/收付方式中文映射、money() 金額、pending/signed 狀態標籤', async () => {
    const w = await mountDialog({
      ...emptyDetail(),
      misc_receipt: [
        { id: 1, date: '2026-05-10', payer_name: '王小明', category: 'donation', amount: 8000, payment_method: 'cash', description: '愛心捐款', receipt_number: 'MR-001', status: 'signed' },
        { id: 2, date: '2026-05-12', payer_name: '社區協會', category: 'rent', amount: 12000, payment_method: 'bank_transfer', description: '場地出租', receipt_number: 'MR-002', status: 'pending' },
      ],
    })

    const panes = w.findAllComponents({ name: 'ElTabPane' })
    const miscPane = panes.find(p => p.props('name') === 'misc_receipt')
    expect(miscPane).toBeTruthy()
    expect(miscPane.props('label')).toBe('雜項收款 (2)')

    const text = miscPane.text()
    // 類別中文（沿用 constants/signoff 共用映射：donation → 捐款、rent → 場地租金）
    expect(text).toContain('捐款')
    expect(text).toContain('場地租金')
    // 金額走 money()（NT$ 千分位）
    expect(text).toContain('NT$8,000')
    expect(text).toContain('NT$12,000')
    // 收付方式中文
    expect(text).toContain('現金')
    expect(text).toContain('銀行匯款')
    // 狀態 pending/signed → 待簽收/已簽收
    expect(text).toContain('已簽收')
    expect(text).toContain('待簽收')
    // 其他欄位原樣渲染
    expect(text).toContain('王小明')
    expect(text).toContain('MR-002')
  })

  it('misc_receipt 為空陣列時分頁仍存在且筆數為 0（真零值非錯誤）', async () => {
    const w = await mountDialog(emptyDetail())

    const panes = w.findAllComponents({ name: 'ElTabPane' })
    const miscPane = panes.find(p => p.props('name') === 'misc_receipt')
    expect(miscPane).toBeTruthy()
    expect(miscPane.props('label')).toBe('雜項收款 (0)')
  })
})
