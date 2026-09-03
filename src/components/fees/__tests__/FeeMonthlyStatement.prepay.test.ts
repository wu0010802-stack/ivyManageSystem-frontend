/**
 * 彙總繳費表 × 預繳款整合（2026-08-26 預繳併入帳款）：
 * 預繳欄顯示與點擊開抽屜、mutation 後整體重抓。
 *
 * SPEC-019（2026-09-02）：工具列「預繳款」下拉（訪視預繳／預繳退款）移到
 * 現金項目檢視，本表只保留每列「預繳」欄與 PrepaymentDrawer。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getFeeMonthlyStatement = vi.fn()
const getPrepayments = vi.fn()
vi.mock('@/api/fees', () => ({
  getFeeMonthlyStatement: (...args: unknown[]) => getFeeMonthlyStatement(...args),
  getPrepayments: (...args: unknown[]) => getPrepayments(...args),
}))

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

vi.mock('@/utils/format', () => ({
  todayISO: () => '2026-08-25',
}))

vi.mock('@/components/fees/BatchPayDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'BatchPayDialog',
    props: { modelValue: { type: Boolean, default: false } },
    template: '<div data-testid="batch-pay-stub" />',
  },
}))
vi.mock('@/components/fees/PrepaymentDrawer.vue', () => ({
  __esModule: true,
  default: {
    name: 'PrepaymentDrawer',
    props: {
      modelValue: { type: Boolean, default: false },
      credits: { type: Array, default: () => [] },
      title: { type: String, default: '' },
    },
    emits: ['update:modelValue', 'refresh'],
    template:
      '<div v-if="modelValue" data-testid="prepay-drawer" :data-title="title" :data-count="credits.length" />',
  },
}))
vi.mock('@/components/fees/StudentCashReceiptDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'StudentCashReceiptDialog',
    props: { modelValue: { type: Boolean, default: false } },
    template: '<div data-testid="cash-dialog-stub" />',
  },
}))

import FeeMonthlyStatement from '@/components/fees/FeeMonthlyStatement.vue'

/** settlement 五桶（MonthlyStatementItemOut.settlement 為必填欄） */
const ZERO_SETTLEMENT = {
  cash_registered: 0,
  cash_submitted: 0,
  cash_confirmed: 0,
  bank_reconciled: 0,
  unreceipted: 0,
}

const STATEMENT = {
  month: '2026-08',
  students: [
    {
      student_id: 5,
      student_name: '王小明',
      classroom_name: '向日葵',
      status: 'unpaid',
      total_due: 12000,
      total_paid: 0,
      outstanding: 12000,
      items: [
        {
          id: 21,
          fee_item_name: '註冊費',
          fee_type: 'registration',
          period: '115-1',
          amount_due: 12000,
          status: 'unpaid',
          payment_date: null,
          payment_method: null,
          source: 'bill_slip',
          settlement: { ...ZERO_SETTLEMENT },
        },
      ],
    },
    {
      student_id: 6,
      student_name: '林小華',
      classroom_name: '向日葵',
      status: 'unpaid',
      total_due: 9000,
      total_paid: 0,
      outstanding: 9000,
      items: [
        {
          id: 22,
          fee_item_name: '月費',
          fee_type: 'monthly',
          period: '115-1',
          amount_due: 9000,
          status: 'unpaid',
          payment_date: null,
          payment_method: null,
          source: 'bill_slip',
          settlement: { ...ZERO_SETTLEMENT },
        },
      ],
    },
  ],
}

const CREDITS = {
  total: 3,
  items: [
    {
      id: 1, student_id: 5, student_name: '王小明',
      recruitment_visit_id: null, visit_child_name: null,
      target_school_year: 115, target_semester: 1,
      original_amount: 5000, status: 'available', balance: 5000,
    },
    {
      id: 2, student_id: null, student_name: null,
      recruitment_visit_id: 9, visit_child_name: '陳新生',
      target_school_year: 115, target_semester: 1,
      original_amount: 5000, status: 'available', balance: 5000,
    },
    // 終態（已退款）額度：不顯示於欄位、不列入訪視入口
    {
      id: 3, student_id: null, student_name: null,
      recruitment_visit_id: 10, visit_child_name: '張退款',
      target_school_year: 115, target_semester: 1,
      original_amount: 5000, status: 'refunded', balance: 0,
    },
  ],
}

const GLOBAL_STUBS = {
  'el-button': {
    template: '<button type="button" v-bind="$attrs" :disabled="disabled"><slot /></button>',
    props: { disabled: { type: Boolean, default: false } },
  },
  'el-input': {
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-select': {
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  'el-option': {
    props: { value: { type: String, default: '' }, label: { type: String, default: '' } },
    template: '<option :value="value" v-bind="$attrs">{{ label }}</option>',
  },
  'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
  'el-skeleton': { template: '<div data-testid="stmt-skeleton" />' },
}

const mountStatement = () =>
  mount(FeeMonthlyStatement, {
    props: { classrooms: [{ id: 1, name: '向日葵', grade_name: '小班' }] },
    global: { stubs: GLOBAL_STUBS },
  })

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
  getFeeMonthlyStatement.mockResolvedValue(STATEMENT)
  getPrepayments.mockResolvedValue(CREDITS)
})

describe('預繳欄', () => {
  it('有可用額度顯示「可用 NT$5,000」，無額度顯示 —', async () => {
    const wrapper = mountStatement()
    await flushPromises()
    const cells = wrapper.findAll('[data-test="stmt-prepay-cell"]')
    expect(cells).toHaveLength(1)
    expect(cells[0].text()).toContain('可用 NT$5,000')
    // 林小華（無額度）該欄為 —
    const rows = wrapper.findAll('[data-test="stmt-row"]')
    expect(rows[1].text()).not.toContain('可用')
  })

  it('點預繳格開抽屜，只帶該生額度、標題含學生姓名', async () => {
    const wrapper = mountStatement()
    await flushPromises()
    await wrapper.find('[data-test="stmt-prepay-cell"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.find('[data-testid="prepay-drawer"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.attributes('data-title')).toBe('王小明 的預繳款')
    expect(drawer.attributes('data-count')).toBe('1')
  })
})

describe('工具列入口', () => {
  it('工具列不再有預繳款下拉（移到現金項目檢視）', async () => {
    const wrapper = mountStatement()
    await flushPromises()
    expect(wrapper.find('[data-test="stmt-prepay-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stmt-visit-prepay"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stmt-refund-todo"]').exists()).toBe(false)
  })
})

describe('mutation 後重抓', () => {
  it('抽屜 emit refresh 時帳款與預繳一起重抓（套用會建立折抵影響應繳）', async () => {
    const wrapper = mountStatement()
    await flushPromises()
    await wrapper.find('[data-test="stmt-prepay-cell"]').trigger('click')
    await flushPromises()
    getFeeMonthlyStatement.mockClear()
    getPrepayments.mockClear()
    wrapper.findComponent({ name: 'PrepaymentDrawer' }).vm.$emit('refresh')
    await flushPromises()
    expect(getFeeMonthlyStatement).toHaveBeenCalledTimes(1)
    expect(getPrepayments).toHaveBeenCalledTimes(1)
  })

  it('exposed refresh（帳單工作區切回時）也會重抓預繳', async () => {
    const wrapper = mountStatement()
    await flushPromises()
    getPrepayments.mockClear()
    ;(wrapper.vm as unknown as { refresh: () => void }).refresh()
    await flushPromises()
    expect(getPrepayments).toHaveBeenCalledTimes(1)
  })
})

describe('載入失敗', () => {
  it('預繳載入失敗不阻擋帳款主表（欄位顯示 —）', async () => {
    getPrepayments.mockRejectedValue(new Error('boom'))
    const wrapper = mountStatement()
    await flushPromises()
    expect(wrapper.findAll('[data-test="stmt-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-test="stmt-prepay-cell"]').exists()).toBe(false)
  })
})
