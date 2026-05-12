import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/salary', () => ({
  simulateSalary: vi.fn(),
}))

import SalaryBreakdown from '@/views/salary/SalaryBreakdown.vue'
import { simulateSalary } from '@/api/salary'

const teacherRow = () => ({
  employee_id: 42,
  employee_name: '班導甲',
  festival_bonus: 12000,
  overtime_bonus: 4500,
  net_pay: 35000,
  breakdown: {
    enrollment: {
      snapshot_date: '2026-05-31',
      total: 23,
      classroom_id: 5,
      classroom_name: '大班 A',
      grade_name: '大班',
    },
    assistant: null,
  },
})

const mountWithEP = (props) =>
  mount(SalaryBreakdown, {
    props,
    global: { plugins: [ElementPlus] },
  })

describe('SalaryBreakdown', () => {
  beforeEach(() => {
    simulateSalary.mockReset()
  })

  it('renders enrollment section with snapshot date and classroom', () => {
    const wrapper = mountWithEP({ row: teacherRow(), year: 2026, month: 5 })
    const text = wrapper.text()
    expect(text).toContain('大班 A')
    expect(text).toContain('23')
    expect(text).toContain('2026/05/31')
  })

  it('renders grade_name alongside classroom_name', () => {
    const wrapper = mountWithEP({ row: teacherRow(), year: 2026, month: 5 })
    expect(wrapper.text()).toContain('大班 A')
    expect(wrapper.text()).toContain('（大班）')
  })

  it('shows fallback text when breakdown is null and no assistant', () => {
    const row = {
      employee_id: 1,
      employee_name: '行政',
      net_pay: 28000,
      breakdown: { enrollment: null, assistant: null },
    }
    const wrapper = mountWithEP({ row, year: 2026, month: 5 })
    expect(wrapper.text()).toContain('此員工無班級資料')
  })

  it('renders assistant classroom names when present', () => {
    const row = teacherRow()
    row.breakdown.assistant = { by_classroom: ['大班 A', '大班 B'] }
    const wrapper = mountWithEP({ row, year: 2026, month: 5 })
    expect(wrapper.text()).toContain('兼任班級')
    expect(wrapper.text()).toContain('大班 A、大班 B')
  })

  it('hides assistant section when by_classroom is empty', () => {
    const row = teacherRow()
    row.breakdown.assistant = { by_classroom: [] }
    const wrapper = mountWithEP({ row, year: 2026, month: 5 })
    expect(wrapper.text()).not.toContain('兼任班級')
  })

  it('classroom link opens in a new tab', () => {
    const wrapper = mountWithEP({ row: teacherRow(), year: 2026, month: 5 })
    const link = wrapper.find('a[href="/classrooms"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('calls simulateSalary with enrollment_override when clicking 重算', async () => {
    simulateSalary.mockResolvedValueOnce({
      data: {
        simulated: { festival_bonus: 13000, overtime_bonus: 6000, net_pay: 37000 },
      },
    })
    const wrapper = mountWithEP({ row: teacherRow(), year: 2026, month: 5 })
    const input = wrapper.findComponent({ name: 'ElInputNumber' })
    await input.setValue(25)
    await wrapper.find('button.el-button--primary').trigger('click')
    await wrapper.vm.$nextTick()

    expect(simulateSalary).toHaveBeenCalledWith({
      employee_id: 42,
      year: 2026,
      month: 5,
      overrides: { enrollment_override: 25 },
    })
  })

  it('shows preview row after simulate response and emits preview-changed', async () => {
    simulateSalary.mockResolvedValueOnce({
      data: {
        simulated: { festival_bonus: 13500, overtime_bonus: 6000, net_pay: 38000 },
      },
    })
    const wrapper = mountWithEP({ row: teacherRow(), year: 2026, month: 5 })
    await wrapper.find('button.el-button--primary').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('預覽')
    expect(wrapper.emitted('preview-changed')).toBeTruthy()
    expect(wrapper.emitted('preview-changed')[0][0]).toMatchObject({
      employee_id: 42,
      simulated: { net_pay: 38000 },
    })
  })

  it('reset button clears preview and emits reset', async () => {
    simulateSalary.mockResolvedValueOnce({
      data: {
        simulated: { festival_bonus: 13500, overtime_bonus: 6000, net_pay: 38000 },
      },
    })
    const wrapper = mountWithEP({ row: teacherRow(), year: 2026, month: 5 })
    await wrapper.find('button.el-button--primary').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const resetBtn = wrapper.findAll('button').find((b) => b.text().includes('重設回'))
    await resetBtn.trigger('click')

    expect(wrapper.text()).not.toContain('預覽：')
    expect(wrapper.emitted('reset')).toBeTruthy()
    expect(wrapper.emitted('reset')[0][0]).toEqual({ employee_id: 42 })
  })
})
