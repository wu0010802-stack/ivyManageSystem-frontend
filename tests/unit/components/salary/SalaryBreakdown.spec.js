import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHashHistory } from 'vue-router'
import ElementPlus from 'element-plus'

vi.mock('@/api/salary', () => ({
  simulateSalary: vi.fn(),
}))

// 保留真實 EP 元件（runSimulate 測試需要透過 ElInputNumber/ElButton 互動），
// 只覆寫 ElMessage 為可監視 mock。
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

import SalaryBreakdown from '@/views/salary/SalaryBreakdown.vue'
import { simulateSalary } from '@/api/salary'
import { ElMessage } from 'element-plus'

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

const buildRouter = () =>
  createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/classrooms', name: 'classrooms', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })

const mountWithEP = (props) =>
  mount(SalaryBreakdown, {
    props,
    global: { plugins: [ElementPlus, buildRouter()] },
  })

describe('SalaryBreakdown', () => {
  beforeEach(() => {
    simulateSalary.mockReset()
    ElMessage.error.mockReset()
    ElMessage.success.mockReset()
    ElMessage.warning.mockReset()
    ElMessage.info.mockReset()
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
    // 使用 hash router（createWebHashHistory）後，router.resolve 會產生帶 '#/classrooms' 的 href，
    // 在 prod 對應 /admin.html#/classrooms。避免硬寫 '/classrooms' 失效。
    const link = wrapper.find('a[target="_blank"]')
    expect(link.exists()).toBe(true)
    const href = link.attributes('href')
    expect(href).toContain('classrooms')
    expect(href).toContain('#') // hash-aware，不是裸 /classrooms
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

  it('shows error message when simulate fails', async () => {
    simulateSalary.mockRejectedValueOnce({
      response: { data: { detail: '伺服器錯誤' } },
      message: 'Request failed',
    })
    const wrapper = mountWithEP({ row: teacherRow(), year: 2026, month: 5 })
    await wrapper.find('button.el-button--primary').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(ElMessage.error).toHaveBeenCalled()
    expect(ElMessage.error.mock.calls[0][0]).toContain('伺服器錯誤')
    // 預覽不應出現（catch 後不會 emit）
    expect(wrapper.text()).not.toContain('預覽：')
    // simulating 旗標已重置（loading 結束）
    const btn = wrapper.find('button.el-button--primary')
    expect(btn.classes()).not.toContain('is-loading')
  })
})
