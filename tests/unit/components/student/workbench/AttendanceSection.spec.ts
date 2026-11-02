/**
 * 學生儀表板「每日點名」區塊（2026-11-02 改為就地編修）：點名表本身與回應競態由
 * AttendanceBatchPanel 負責（見 tests/unit/components/AttendanceBatchPanel.context.test.ts），
 * 這裡只驗區塊層的接線：點名日期與班級／學生篩選怎麼傳給點名表、各班進度列、回寫。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAcademicAffairsFilters, ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import AttendanceSection from '@/components/student/academic-affairs/AttendanceSection.vue'
import AttendanceBatchPanel from '@/components/student/academic-affairs/AttendanceBatchPanel.vue'
import { getAttendanceOverview } from '@/api/studentAttendance'

vi.mock('@/api/studentAttendance', () => ({
  getAttendanceOverview: vi.fn(),
  getDailyAttendance: vi.fn(),
  batchSaveAttendance: vi.fn(),
}))

const overviewRow = (id: number, name: string, status: string, unmarked = 0) => ({
  classroom_id: id, classroom_name: name, rollcall_status: status, unmarked_count: unmarked,
  student_count: 10, recorded_count: 10 - unmarked, on_campus_count: 0, present_count: 0, late_count: 0,
  absent_count: 0, leave_count: 0, record_completion_rate: 0, attendance_rate: 0,
})

function mountSection(initial: { studentId?: number } = {}) {
  const ctx = useAcademicAffairsFilters({ classroomId: 1, dateRange: ['2026-08-01', '2026-08-31'], studentId: initial.studentId })
  const wrapper = shallowMount(AttendanceSection, {
    props: { attendanceDate: '2026-09-06' },
    global: {
      provide: { [ACADEMIC_AFFAIRS_FILTERS_KEY as symbol]: ctx },
      stubs: { SectionCard: { template: '<div><slot name="actions" /><slot name="summary" /><slot /></div>' } },
    },
  })
  return { wrapper, ctx }
}

describe('每日點名區塊', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getAttendanceOverview).mockReset()
  })

  it('點名表用獨立的點名日期、目前班級與學生篩選', async () => {
    vi.mocked(getAttendanceOverview).mockResolvedValue({ data: { classrooms: [] } } as never)
    const { wrapper } = mountSection({ studentId: 7 })
    await flushPromises()
    const panel = wrapper.findComponent(AttendanceBatchPanel)
    expect(panel.props('date')).toBe('2026-09-06')
    expect(panel.props('classroomId')).toBe(1)
    expect(panel.props('studentId')).toBe(7)
    expect(getAttendanceOverview).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2026-09-06' }))
  })

  it('各班進度：列出每班狀態，點班級即切換', async () => {
    vi.mocked(getAttendanceOverview).mockResolvedValue({
      data: { classrooms: [overviewRow(1, '天堂鳥', 'complete'), overviewRow(2, '櫻花', 'partial', 3), overviewRow(3, '百合', 'unstarted', 10)] },
    } as never)
    const { wrapper, ctx } = mountSection()
    await flushPromises()
    const chips = wrapper.findAll('.class-chip')
    expect(chips.map(c => c.text().replace(/\s+/g, ''))).toEqual(['天堂鳥完成', '櫻花差3', '百合未點名'])
    expect(wrapper.text()).toContain('1／3')
    await chips[1].trigger('click')
    expect(ctx.filters.classroomId).toBe(2)
  })

  it('只看得到自己班（overview 403）時不顯示進度列，點名表照常', async () => {
    vi.mocked(getAttendanceOverview).mockRejectedValue({ response: { status: 403 } })
    const { wrapper } = mountSection()
    await flushPromises()
    expect(wrapper.find('.class-progress').exists()).toBe(false)
    expect(wrapper.findComponent(AttendanceBatchPanel).exists()).toBe(true)
  })

  it('點名表「返回儲存」回寫班級時不清掉學生篩選；回寫日期往外 emit', async () => {
    vi.mocked(getAttendanceOverview).mockResolvedValue({ data: { classrooms: [] } } as never)
    const { wrapper, ctx } = mountSection({ studentId: 7 })
    await flushPromises()
    const panel = wrapper.findComponent(AttendanceBatchPanel)
    panel.vm.$emit('update:classroomId', 5)
    panel.vm.$emit('update:date', '2026-09-05')
    expect(ctx.filters.classroomId).toBe(5)
    expect(ctx.filters.studentId).toBe(7)
    expect(wrapper.emitted('update:attendanceDate')).toEqual([['2026-09-05']])
  })
})
