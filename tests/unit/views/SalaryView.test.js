import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SalaryView from '@/views/SalaryView.vue'

const calculate = vi.fn()
const getFestivalBonus = vi.fn()
const getRecords = vi.fn()
const getSalaryFieldBreakdown = vi.fn()
const manualAdjustSalary = vi.fn()
const downloadFile = vi.fn()

vi.mock('@/api/salary', () => ({
  calculate: (...args) => calculate(...args),
  getFestivalBonus: (...args) => getFestivalBonus(...args),
  getRecords: (...args) => getRecords(...args),
  getSalaryFieldBreakdown: (...args) => getSalaryFieldBreakdown(...args),
  manualAdjustSalary: (...args) => manualAdjustSalary(...args),
  getHistory: vi.fn(),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: (...args) => downloadFile(...args),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('SalaryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRecords.mockResolvedValue({ data: [] })
    getFestivalBonus.mockResolvedValue({ data: [] })
    calculate.mockResolvedValue({
      data: {
        results: [
          {
            employee_id: 1,
            employee_name: '王小明',
            festival_bonus: 2000,
            overtime_bonus: 500,
            overtime_pay: 1200,
            supervisor_dividend: 1000,
            meeting_overtime_pay: 800,
            birthday_bonus: 0,
            leave_deduction: 300,
            late_deduction: 100,
            early_leave_deduction: 0,
            meeting_absence_deduction: 200,
            absence_deduction: 0,
            total_deductions: 3100,
            net_pay: 36100,
          },
        ],
        errors: [],
      },
    })
    getSalaryFieldBreakdown.mockResolvedValue({
      data: {
        title: '節慶獎金明細',
        field: 'festival_bonus',
        employee: {
          record_id: 8,
          employee_name: '王小明',
          employee_code: 'E001',
          job_title: '幼兒園教師',
          year: 2026,
          month: 3,
        },
        columns: [
          { key: 'name', label: '姓名' },
          { key: 'category', label: '類別' },
          { key: 'bonusBase', label: '獎金基數' },
          { key: 'result', label: '獎金' },
        ],
        rows: [
          {
            name: '王小明',
            category: '帶班老師',
            bonusBase: 2000,
            result: 2000,
          },
        ],
        summary: {
          amount: 2000,
        },
        note: '節慶獎金扣減不包含在本明細，該欄位另有獨立明細。',
      },
    })
    manualAdjustSalary.mockResolvedValue({
      data: {
        record: {
          id: 8,
          festival_bonus: 1800,
          overtime_bonus: 500,
          overtime_pay: 1200,
          supervisor_dividend: 1000,
          meeting_overtime_pay: 800,
          birthday_bonus: 0,
          leave_deduction: 500,
          late_deduction: 100,
          early_leave_deduction: 0,
          meeting_absence_deduction: 200,
          absence_deduction: 0,
          total_deduction: 3300,
          net_salary: 35900,
          remark: '[2026-03-14 10:00] 手動編輯：節慶獎金 2000→1800；請假扣款 300→500',
        },
      },
    })
  })

  it('點欄位會抓指定 field breakdown 並開 dialog', async () => {
    const wrapper = mount(SalaryView, {
      global: {
        directives: {
          loading: () => {},
        },
        stubs: {
          BonusConfigPanel: true,
          SalaryHistoryPanel: true,
          EmptyState: true,
          Search: true,
          InfoFilled: true,
          'el-tabs': { template: '<div><slot /></div>' },
          'el-tab-pane': { template: '<div><slot /></div>' },
          'el-card': { template: '<div><slot /></div>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': true,
          'el-tooltip': { template: '<span><slot /></span>' },
          'el-icon': { template: '<span><slot /></span>' },
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-descriptions': { template: '<div><slot /></div>' },
          'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}<slot /></div>' },
          'el-alert': { template: '<div><slot />{{ title }}</div>', props: ['title'] },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
          'el-input-number': {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
          },
        },
      },
    })

    await wrapper.vm.$.setupState.calculateSalary()
    wrapper.vm.$.setupState.salaryRecords = [
      { id: 8, employee_id: 1, employee_name: '王小明' },
    ]
    await wrapper.vm.$.setupState.openFieldBreakdown(
      { employee_id: 1, employee_name: '王小明' },
      'festival_bonus',
    )
    await flushPromises()
    await nextTick()

    expect(getSalaryFieldBreakdown).toHaveBeenCalledWith(8, 'festival_bonus')
    expect(wrapper.vm.$.setupState.fieldBreakdown.columns[0].label).toBe('姓名')
    expect(wrapper.text()).toContain('節慶獎金扣減不包含在本明細')
    expect(wrapper.text()).toContain('明細合計')
  })

  it('手動編輯後會更新列上的金額與編輯紀錄', async () => {
    const wrapper = mount(SalaryView, {
      global: {
        directives: {
          loading: () => {},
        },
        stubs: {
          BonusConfigPanel: true,
          SalaryHistoryPanel: true,
          EmptyState: true,
          Search: true,
          InfoFilled: true,
          'el-tabs': { template: '<div><slot /></div>' },
          'el-tab-pane': { template: '<div><slot /></div>' },
          'el-card': { template: '<div><slot /></div>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': true,
          'el-tooltip': { template: '<span><slot /></span>' },
          'el-icon': { template: '<span><slot /></span>' },
          'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
          'el-descriptions': { template: '<div><slot /></div>' },
          'el-descriptions-item': { props: ['label'], template: '<div>{{ label }}<slot /></div>' },
          'el-alert': { template: '<div><slot />{{ title }}</div>', props: ['title'] },
          'el-form': { template: '<form><slot /></form>' },
          'el-form-item': { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
          'el-input-number': {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
          },
        },
      },
    })

    await wrapper.vm.$.setupState.calculateSalary()
    wrapper.vm.$.setupState.salaryRecords = [
      { id: 8, employee_id: 1, employee_name: '王小明', remark: '' },
    ]
    const row = wrapper.vm.$.setupState.salaryResults[0]

    wrapper.vm.$.setupState.openEditDialog(row)
    wrapper.vm.$.setupState.editForm.festival_bonus = 1800
    wrapper.vm.$.setupState.editForm.leave_deduction = 500
    await wrapper.vm.$.setupState.saveManualAdjust()
    await flushPromises()
    await nextTick()

    expect(manualAdjustSalary).toHaveBeenCalledWith(
      8,
      expect.objectContaining({
        festival_bonus: 1800,
        leave_deduction: 500,
      }),
      // 第 3 參數為 version（If-Match 樂觀鎖），此測試資料未帶 version → null
      null,
    )
    expect(row.festival_bonus).toBe(1800)
    expect(row.leave_deduction).toBe(500)
    expect(row.total_deductions).toBe(3300)
    expect(row.net_pay).toBe(35900)
    expect(row.remark).toContain('手動編輯')
  })
})
