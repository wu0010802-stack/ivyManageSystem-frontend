import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import QuickLeaveDialog from '../QuickLeaveDialog.vue'

// 業主 2026-10-30 裁定：請假時數由後端依排班重算覆寫，前端只顯示。快速新增請假原本讓 HR
// 手填時數（預設 8h，可少報兩天只報 8h），改為顯示 GET /leaves/workday-hours 的 leave_hours。
const getWorkdayHoursMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/leaves', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, getWorkdayHours: getWorkdayHoursMock, createLeave: vi.fn() }
})
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [{ id: 1, name: '王副導' }], loading: false, fetchEmployees: vi.fn() }),
}))

type Vm = { form: Record<string, unknown> }

const settle = async () => {
  await flushPromises()
  await new Promise((r) => setTimeout(r, 350)) // useDebounceFn 300ms
  await flushPromises()
}

describe('QuickLeaveDialog — 時數由後端計算', () => {
  beforeEach(() => {
    getWorkdayHoursMock.mockReset()
    getWorkdayHoursMock.mockResolvedValue({
      data: {
        total_hours: 17,
        leave_hours: 17,
        breakdown: [
          { date: '2026-10-07', type: 'workday', hours: 8.5 },
          { date: '2026-10-08', type: 'workday', hours: 8.5 },
        ],
      },
    })
  })

  it('選員工與日期後顯示 workday-hours 回傳的 leave_hours，且時數不可手改', async () => {
    const wrapper = mount(QuickLeaveDialog, {
      props: { visible: true },
      global: { stubs: { teleport: true } },
    })
    const vm = wrapper.vm as unknown as Vm
    vm.form.employee_id = 1
    vm.form.start_date = '2026-10-07'
    vm.form.end_date = '2026-10-08'
    await settle()

    expect(getWorkdayHoursMock).toHaveBeenLastCalledWith({
      employee_id: 1,
      start_date: '2026-10-07',
      end_date: '2026-10-08',
    })
    expect(vm.form.leave_hours).toBe(17)
    expect(wrapper.find('[data-test="quick-leave-hours"]').text()).toContain('17')
    expect(wrapper.find('.el-input-number').exists()).toBe(false)
  })
})
