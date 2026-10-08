import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
const { preview, notify, access } = vi.hoisted(() => ({ preview: vi.fn(), notify: vi.fn(), access: { salary: true, attendance: true, full: true } }))
vi.mock('@/api/attendance', () => ({ previewPayrollComparison: preview }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (code: string) => code === 'SALARY_READ' ? access.salary : code === 'ATTENDANCE_READ' ? access.attendance : false,
  hasFullSalaryView: () => access.full,
}))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify }) }))
import PayrollComparisonDialog from '../PayrollComparisonDialog.vue'
const fixture = { worksheets: ['薪資表', '才藝老師'], worksheet: '薪資表', year: 2026, month: 8,
  employees: [{ id: 1, employee_number: 'T001', name: '測試員工' }],
  summary: { matched: 0, different: 1, unverified: 0, problems: 0 }, warnings: [],
  rows: [{ source_row: 4, source_name: '測試員工', employee_id: 1, employee_number: 'T001', employee_name: '測試員工',
    match_status: 'matched', salary_state: 'draft', status: 'different', warnings: [],
    comparisons: [{ key: 'late_early', label: '遲到／早退扣款', source_amount: '30', system_amount: '20', difference: '10', status: 'different', reason: null },
      { key: 'leave_total', label: '請假扣款合計', source_amount: null, system_amount: '100', difference: null, status: 'unverified', reason: '尚未確認請假扣款範圍' }],
    attendance: { recorded_days: 20, late_minutes: 10, early_leave_minutes: 0, missing_punch_days: 1, unconfirmed_days: 1, approved_leave_count: 1, approved_overtime_count: 0 },
  }],
}
function makeWrapper() {
  return mount(PayrollComparisonDialog, { props: { modelValue: true, year: 2026, month: 8 }, global: { stubs: {
    FormDialog: { props: ['modelValue', 'title'], template: '<div v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' },
    'el-button': { props: ['disabled', 'loading'], emits: ['click'], template: `<button :disabled="disabled || loading" @click="$emit('click')"><slot /></button>` },
  } } })
}
async function chooseFile(wrapper: ReturnType<typeof makeWrapper>) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['synthetic'], 'salary.xlsx')], configurable: true })
  await input.trigger('change')
  await flushPromises()
}
async function compare(wrapper: ReturnType<typeof makeWrapper>) {
  const button = wrapper.findAll('button').find(item => item.text().includes('核對選定工作表'))!
  await button.trigger('click')
  await flushPromises()
}
beforeEach(() => { vi.clearAllMocks(); access.salary = true; access.attendance = true; access.full = true; preview.mockResolvedValue({ data: fixture }) })

describe('薪資扣項唯讀核對', () => {
  it('先讀工作表清單，兩項口徑預設不確認', async () => {
    const wrapper = makeWrapper()
    await chooseFile(wrapper)
    const form = preview.mock.calls[0][0] as FormData
    expect(form.has('worksheet')).toBe(false)
    expect(form.get('leave_scope_confirmed')).toBe('false')
    expect(form.get('blank_deductions_as_zero')).toBe('false')
    expect(wrapper.find('option[value="才藝老師"]').attributes('disabled')).toBeDefined()
  })
  it('顯示來源減系統的差額、草稿狀態與不可比較原因', async () => {
    const wrapper = makeWrapper()
    await chooseFile(wrapper)
    await compare(wrapper)
    expect(wrapper.text()).toContain('外部扣款 − 系統扣款')
    expect(wrapper.text()).toContain('草稿')
    expect(wrapper.text()).toContain('NT$10')
    expect(wrapper.text()).toContain('尚未確認請假扣款範圍')
    expect(wrapper.text()).toContain('—')
  })
  it('改變扣款口徑立即移除舊比較金額', async () => {
    const wrapper = makeWrapper()
    await chooseFile(wrapper)
    await compare(wrapper)
    await wrapper.find('input[data-test="leave-scope"]').setValue(true)
    expect(wrapper.text()).not.toContain('NT$10')
    expect(wrapper.text()).toContain('請重新核對')
  })
  it('月份變更後忽略舊工作表回應', async () => {
    let resolve!: (value: { data: typeof fixture }) => void
    preview.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const wrapper = makeWrapper()
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'old.xlsx')] })
    await input.trigger('change')
    await wrapper.setProps({ month: 9 })
    resolve({ data: fixture })
    await flushPromises()
    expect(wrapper.find('select[aria-label="薪資工作表"]').exists()).toBe(false)
  })
  it.each(['salary', 'attendance', 'full'] as const)('缺少%s視野不顯示檔案入口、不呼叫API', async (key) => {
    access[key] = false
    const wrapper = makeWrapper()
    await nextTick()
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(preview).not.toHaveBeenCalled()
  })
})


describe('原始精確金額', () => {
  it('保留小於一分的非零差異', async () => {
    preview.mockResolvedValue({ data: { ...fixture, rows: [{ ...fixture.rows[0], comparisons: [{ ...fixture.rows[0].comparisons[0], difference: '0.000004' }] }] } })
    const wrapper = makeWrapper()
    await chooseFile(wrapper)
    await compare(wrapper)
    expect(wrapper.text()).toContain('NT$0.000004')
    expect(wrapper.text()).toContain('原始值有差異')
  })
})
