import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

// 避免 onMounted 抓資料炸：mock store 與 API 依賴為最小空集合
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({
    school_year: 113,
    semester: 1,
    setTerm: vi.fn(),
  }),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/api/studentAttendance', () => ({
  getAttendanceOverview: vi.fn(() => new Promise(() => {})),
  getDailyAttendance: vi.fn(() => new Promise(() => {})),
  getMonthlySummary: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/composables/useChartJs', () => ({
  BarChart: { name: 'BarChart', template: '<div></div>' },
}))

import { getMonthlySummary } from '@/api/studentAttendance'
import StudentAttendanceView from '@/views/StudentAttendanceView.vue'

// el-table / el-table-column 不是全域安裝的 Element Plus，shallowMount 下不自動 stub；
// 明確傳入 stubs，讓 el-table-column 不執行帶 scope 的 slot（否則 scope.row 為 undefined 炸）
const globalStubs = {
  stubs: {
    // el-table stub 保留 name 讓 findComponent({ name: 'ElTable' }) 可命中
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    // el-table-column stub 不 render 任何 slot，避免 scope.row undefined
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
    'AttendanceBatchPanel': { name: 'AttendanceBatchPanel', template: '<div></div>' },
    AdminListToolbar: true,
  },
}

describe('StudentAttendanceView 班級總覽手機卡片切換', () => {
  it('手機顯示 AdminListCards、桌機不顯示', async () => {
    mockIsMobile.value = true
    const w = shallowMount(StudentAttendanceView, { global: globalStubs })
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)

    mockIsMobile.value = false
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })
})

describe('StudentAttendanceView 月分析姓名搜尋', () => {
  const students = [
    { student_id: 1, name: '王小明', student_no: 'A001', attendance_rate: 90 },
    { student_id: 2, name: '李大華', student_no: 'A002', attendance_rate: 80 },
  ]

  it('依學生姓名收斂 filteredMonthlyStudents、清空後還原', async () => {
    mockIsMobile.value = false
    vi.mocked(getMonthlySummary).mockResolvedValueOnce({
      data: {
        students,
        alerts: [],
        classroom_attendance_rate: 85,
        classroom_record_completion_rate: 100,
        school_days_count: 20,
        classroom_name: '小班',
        year: 113,
        month: 5,
      },
    } as Awaited<ReturnType<typeof getMonthlySummary>>)

    const w = shallowMount(StudentAttendanceView, { global: globalStubs })
    // fetchMonthly 平時由 monthlyClassroomId/monthPicker watcher 觸發；
    // 這裡直接指派班級 id 後手動呼叫，避開 getClassrooms 永遠 pending 導致下拉沒選項的限制
    w.vm.$.setupState.monthlyClassroomId = 1
    await w.vm.$.setupState.fetchMonthly()
    await nextTick()

    expect(w.vm.$.setupState.monthlyStudents).toEqual(students)
    expect(w.vm.$.setupState.monthlyStudentTotal).toBe(2)

    w.vm.$.setupState.monthlyStudentSearch = '王小'
    await nextTick()
    expect(w.vm.$.setupState.filteredMonthlyStudents).toEqual([students[0]])
    expect(w.vm.$.setupState.monthlyStudentShown).toBe(1)
    expect(w.vm.$.setupState.monthlyStudentTotal).toBe(2)

    w.vm.$.setupState.monthlyStudentSearch = ''
    await nextTick()
    expect(w.vm.$.setupState.filteredMonthlyStudents).toEqual(students)
  })
})
