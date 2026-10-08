import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { useAcademicAffairsFilters, ACADEMIC_AFFAIRS_FILTERS_KEY } from '@/composables/useAcademicAffairsFilters'
import AttendanceSection from '@/components/student/academic-affairs/AttendanceSection.vue'
import { getDailyAttendance } from '@/api/studentAttendance'
vi.mock('@/api/studentAttendance', () => ({ getDailyAttendance: vi.fn() }))

function mountSection() {
  const ctx = useAcademicAffairsFilters({ classroomId: 1, dateRange: ['2026-08-01', '2026-08-31'] })
  const wrapper = shallowMount(AttendanceSection, {
    attrs: { attendanceDate: '2026-09-06' },
    global: { provide: { [ACADEMIC_AFFAIRS_FILTERS_KEY as symbol]: ctx }, stubs: {
      SectionCard: { template: '<div><slot name="actions" /><slot name="summary" /><slot /></div>' },
      'el-table': true, 'el-table-column': true, 'el-button': { template: '<button><slot /></button>' },
      'el-drawer': { template: '<div><slot /></div>' }, 'el-tag': { template: '<span><slot /></span>' },
    } },
  })
  return { wrapper, ctx }
}

describe('學生點名日期與回應競態', () => {
  it('使用獨立點名日期查詢及批次點名', async () => {
    vi.mocked(getDailyAttendance).mockResolvedValue({ data: { records: [] } } as never)
    const { wrapper } = mountSection()
    await flushPromises()
    expect(getDailyAttendance).toHaveBeenLastCalledWith({ date: '2026-09-06', classroom_id: 1 })
    expect(wrapper.findComponent({ name: 'AttendanceBatchPanel' }).props('date')).toBe('2026-09-06')
    wrapper.unmount()
  })
  it.each(['班級', '日期'])('切換%s後晚到的舊回應不得覆蓋新資料', async (filter) => {
    let resolve!: (value: unknown) => void
    const slow = new Promise(r => { resolve = r })
    vi.mocked(getDailyAttendance).mockReturnValueOnce(slow as never)
      .mockResolvedValueOnce({ data: { records: [{ student_id: 2, name: '新班測試', status: '出席' }] } } as never)
    const { wrapper, ctx } = mountSection()
    if (filter === '班級') ctx.setClassroom(2)
    else await wrapper.setProps({ attendanceDate: '2026-09-07' })
    await flushPromises()
    resolve({ data: { records: [{ student_id: 1, name: '舊班測試', status: null }] } })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElTable' }).attributes('data')).not.toContain('舊班測試')
    expect(wrapper.text()).toContain('出席 1')
    expect(wrapper.text()).toContain('未點名 0')
    wrapper.unmount()
  })
})
