// tests/components/leave/LeaveCalendar.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LeaveCalendar from '@/views/leave/LeaveCalendar.vue'

const getLeaves = vi.fn()
vi.mock('@/api/leaves', () => ({
  getLeaves: (...a: unknown[]) => getLeaves(...a),
}))

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [] }),
}))

// 形狀對齊 LeaveListItemOut（schema.d.ts），只填行事曆用到的欄位
const leave = (over: Record<string, unknown>) => ({
  id: 1,
  employee_id: 1,
  employee_name: '王怡君',
  status: 'approved',
  start_date: '2026-11-05',
  end_date: '2026-11-05',
  leave_type: 'personal',
  leave_type_label: '事假',
  start_time: null,
  end_time: null,
  leave_hours: 8,
  reason: null,
  ...over,
})

const paged = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 5000, hasMore: false })

async function mountCalendarWith(items: unknown[]) {
  getLeaves.mockResolvedValue(paged(items))
  const wrapper = mount(LeaveCalendar, {
    props: { activeTab: '', year: 2026, month: 11 },
    global: { plugins: [ElementPlus] },
  })
  await wrapper.setProps({ activeTab: 'calendar' })
  await flushPromises()
  return wrapper
}

function countOn(wrapper: Awaited<ReturnType<typeof mountCalendarWith>>, day: number) {
  const cell = wrapper.findAll('.cal-cell').find((c) => c.find('.cal-day-num span').text() === String(day))
  return cell?.find('.cal-leave-count').text()
}

describe('LeaveCalendar 當日請假人數', () => {
  beforeEach(() => getLeaves.mockReset())

  it('同名但不同 employee_id 的兩位員工算 2 人', async () => {
    const wrapper = await mountCalendarWith([
      leave({ id: 1, employee_id: 101 }),
      leave({ id: 2, employee_id: 202 }),
    ])
    expect(countOn(wrapper, 5)).toBe('2 人')
  })

  it('同一員工上午＋下午兩張假單仍只算 1 人', async () => {
    const wrapper = await mountCalendarWith([
      leave({ id: 1, employee_id: 101, start_time: '08:00', end_time: '12:00', leave_hours: 4 }),
      leave({ id: 2, employee_id: 101, start_time: '13:00', end_time: '17:00', leave_hours: 4 }),
    ])
    expect(countOn(wrapper, 5)).toBe('1 人')
  })
})
