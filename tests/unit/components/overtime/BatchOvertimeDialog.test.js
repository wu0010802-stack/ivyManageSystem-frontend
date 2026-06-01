import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BatchOvertimeDialog from '@/components/overtime/BatchOvertimeDialog.vue'

vi.mock('@/api/overtimes', () => ({
  batchCreateOvertimes: vi.fn(() => Promise.resolve({ data: { message: 'ok', created_ids: [1, 2] } })),
}))

const employees = [
  { id: 1, name: '甲', is_active: true },
  { id: 2, name: '乙', is_active: true },
]

function factory() {
  return mount(BatchOvertimeDialog, {
    props: { modelValue: true, employees },
    global: { plugins: [ElementPlus] },
  })
}

describe('BatchOvertimeDialog', () => {
  it('預設帶入所有員工，預設時數套用到每列', () => {
    const wrapper = factory()
    expect(wrapper.vm.rows).toHaveLength(2)
    expect(wrapper.vm.rows.every(r => r.selected)).toBe(true)
    expect(wrapper.vm.rows.every(r => r.hours === wrapper.vm.form.defaultHours)).toBe(true)
  })

  it('buildPayload 只含已勾選員工，帶逐人時數', () => {
    const wrapper = factory()
    wrapper.vm.form.overtime_date = '2026-06-05'
    wrapper.vm.rows[0].selected = true
    wrapper.vm.rows[0].hours = 2
    wrapper.vm.rows[1].selected = false
    const payload = wrapper.vm.buildPayload()
    expect(payload.employees).toEqual([{ employee_id: 1, hours: 2 }])
    expect(payload.overtime_date).toBe('2026-06-05')
  })

  it('解析 422 errors 成顯示清單', () => {
    const wrapper = factory()
    const err = { response: { data: { detail: { errors: [{ employee_id: 2, name: '乙', reason: '超出當月加班上限' }] } } } }
    wrapper.vm.applyBatchErrors(err)
    expect(wrapper.vm.batchErrors).toHaveLength(1)
    expect(wrapper.vm.batchErrors[0].reason).toContain('超出當月加班上限')
  })
})
