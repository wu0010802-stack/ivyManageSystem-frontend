import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SalaryMonthlyOverviewPanel from '../SalaryMonthlyOverviewPanel.vue'

const getOverviewMock = vi.fn()
vi.mock('@/api/salary', () => ({
  getSalaryMonthlyOverview: (...args: unknown[]) => getOverviewMock(...args),
}))

const hasPermissionMock = vi.fn((_p: string) => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (p: string) => hasPermissionMock(p),
}))

const routerPushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

const STUBS = {
  'el-select': true,
  'el-option': true,
  'el-input': true,
  'el-switch': true,
  'el-table': true,
  'el-table-column': true,
  'el-tag': { template: '<span class="tag"><slot /></span>' },
  'el-skeleton': { template: '<div class="skeleton-stub" />' },
  'el-alert': { props: ['title', 'type'], template: '<div class="alert-stub" :data-type="type">{{ title }}<slot /></div>' },
  'el-empty': { props: ['description'], template: '<div class="empty-stub">{{ description }}<slot /></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
}

const employeeRow = (over: Record<string, unknown> = {}) => ({
  employee_id: 1,
  employee_code: 'A001',
  employee_name: '王小明',
  job_title: '教師',
  employee_type: 'regular',
  has_salary_record: true,
  salary_record_id: 10,
  gross_salary: 40000,
  total_deduction: 3000,
  net_salary: 37000,
  unused_leave_payout: 1000,
  base_transfer_amount: 38000,
  salary_separate_transfer: 2000,
  extra_bonus_amount: 3000,
  salary_cash_payout: 43000,
  labor_insurance_employer: 2300,
  health_insurance_employer: 1500,
  pension_employer: 1800,
  employer_burden: 5600,
  employer_cost: 51600,
  is_finalized: true,
  needs_recalc: false,
  has_manual_adjust: false,
  extra_bonus_items: [{ key: 'education_training', label: '教育訓練獎勵金', amount: 3000 }],
  payslip_detail: null,
  ...over,
})

const makeOverview = (over: Record<string, unknown> = {}) => ({
  scope: 'all',
  year: 2026,
  month: 8,
  summary: {
    employee_count: 1,
    regular_count: 1,
    hourly_count: 0,
    finalized_count: 1,
    unfinalized_count: 0,
    needs_recalc_count: 0,
    manual_adjust_count: 0,
    total_gross_salary: 40000,
    total_salary_deduction: 3000,
    total_net_salary: 37000,
    total_unused_leave_payout: 1000,
    total_base_transfer_amount: 38000,
    total_salary_separate_transfer: 2000,
    total_extra_bonus_amount: 3000,
    total_salary_cash_payout: 43000,
    total_labor_insurance_employer: 2300,
    total_health_insurance_employer: 1500,
    total_pension_employer: 1800,
    total_employer_burden: 5600,
    total_employer_cost: 51600,
  },
  transfer_categories: [
    { key: 'base_transfer_regular', label: '主薪轉（正職）', amount: 38000 },
    { key: 'base_transfer_hourly', label: '主薪轉（時薪／才藝老師）', amount: 0 },
    { key: 'salary_separate_transfer', label: '薪資紀錄獨立轉帳', amount: 2000 },
    { key: 'extra_bonus_education_training', label: '表外獎金—教育訓練獎勵金', amount: 3000 },
    { key: 'extra_bonus_after_class_promo', label: '表外獎金—推動才藝獎勵金', amount: 0 },
    { key: 'extra_bonus_teaching_extra', label: '表外獎金—教課教師獎勵金', amount: 0 },
    { key: 'extra_bonus_other', label: '表外獎金—其他表外獎金', amount: 0 },
  ],
  employees: [employeeRow()],
  checks: [
    { key: 'cash_payout_composition', label: '現金給付 = 主薪轉 + 薪資獨立轉帳 + 表外獎金', expected: 43000, actual: 43000, delta: 0, ok: true },
  ],
  checks_status: 'ok',
  total: 1,
  ...over,
})

const okResponse = (over: Record<string, unknown> = {}) => Promise.resolve({ data: makeOverview(over) })

const mountPanel = () =>
  mount(SalaryMonthlyOverviewPanel, {
    props: { year: 2026, month: 8 },
    global: { stubs: STUBS },
  })

beforeEach(() => {
  getOverviewMock.mockReset()
  hasPermissionMock.mockReset()
  hasPermissionMock.mockReturnValue(true)
  routerPushMock.mockReset()
})

describe('SalaryMonthlyOverviewPanel', () => {
  it('載入後渲染摘要帶與雇主負擔帶', async () => {
    getOverviewMock.mockImplementation(() => okResponse())
    const wrapper = mountPanel()
    await flushPromises()
    const text = wrapper.text()
    expect(wrapper.find('[data-testid="summary-employee-count"]').text()).toContain('1')
    expect(wrapper.find('[data-testid="summary-cash-payout"]').text()).toContain('43,000')
    expect(wrapper.find('[data-testid="summary-employer-cost"]').text()).toContain('51,600')
    expect(text).toContain('雇主勞保')
    expect(text).toContain('完整人事成本')
  })

  it('scope=self 時對外發出 scope-change 事件', async () => {
    getOverviewMock.mockImplementation(() => okResponse({ scope: 'self' }))
    const wrapper = mountPanel()
    await flushPromises()
    const emitted = wrapper.emitted('scope-change')
    expect(emitted?.at(-1)).toEqual(['self'])
  })

  it('載入中顯示 skeleton', async () => {
    getOverviewMock.mockImplementation(() => new Promise(() => {}))
    const wrapper = mountPanel()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.skeleton-stub').exists()).toBe(true)
  })

  it('API 失敗顯示可重試 alert，重試後成功渲染', async () => {
    getOverviewMock.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPanel()
    await flushPromises()
    const alert = wrapper.find('.alert-stub')
    expect(alert.exists()).toBe(true)
    expect(wrapper.find('.empty-stub').exists()).toBe(false)

    getOverviewMock.mockImplementation(() => okResponse())
    await wrapper.find('[data-testid="overview-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.alert-stub').exists()).toBe(false)
    expect(wrapper.find('[data-testid="summary-cash-payout"]').exists()).toBe(true)
  })

  it('無資料顯示空狀態；有 SALARY_WRITE 才顯示前往結算按鈕', async () => {
    getOverviewMock.mockImplementation(() =>
      okResponse({ employees: [], total: 0, summary: { ...makeOverview().summary, employee_count: 0 } }),
    )
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('.empty-stub').text()).toContain('此月份尚無薪資紀錄')
    expect(wrapper.find('[data-testid="goto-settle"]').exists()).toBe(true)

    hasPermissionMock.mockImplementation((p: string) => p !== 'SALARY_WRITE')
    const wrapper2 = mountPanel()
    await flushPromises()
    expect(wrapper2.find('[data-testid="goto-settle"]').exists()).toBe(false)
  })

  it('checks mismatch 時顯示對帳警示', async () => {
    getOverviewMock.mockImplementation(() =>
      okResponse({
        checks_status: 'mismatch',
        checks: [
          { key: 'cash_payout_composition', label: '現金給付組成', expected: 43000, actual: 43001, delta: 1, ok: false },
        ],
      }),
    )
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('[data-testid="reconciliation-alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('現金給付組成')
  })

  it('年月快速切換 race guard：晚到的舊請求不得覆蓋新月份', async () => {
    let resolveAug: (v: unknown) => void = () => {}
    const augPromise = new Promise(res => { resolveAug = res })
    getOverviewMock.mockImplementationOnce(() => augPromise)
    const wrapper = mountPanel()
    await wrapper.vm.$nextTick()

    getOverviewMock.mockImplementationOnce(() =>
      okResponse({ month: 9, summary: { ...makeOverview().summary, total_salary_cash_payout: 99999 } }),
    )
    await wrapper.setProps({ month: 9 })
    await flushPromises()
    expect(wrapper.find('[data-testid="summary-cash-payout"]').text()).toContain('99,999')

    // 舊的 8 月回應晚到：不得覆蓋
    resolveAug({ data: makeOverview() })
    await flushPromises()
    expect(wrapper.find('[data-testid="summary-cash-payout"]').text()).toContain('99,999')
  })
})
