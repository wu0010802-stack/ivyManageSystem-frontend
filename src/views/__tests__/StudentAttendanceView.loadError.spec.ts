import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 113, semester: 1, setTerm: vi.fn() }),
}))
vi.mock('@/api/classrooms', () => ({ getClassrooms: vi.fn() }))
vi.mock('@/api/studentAttendance', () => ({
  getAttendanceOverview: vi.fn(),
  getDailyAttendance: vi.fn(() => new Promise(() => {})),
  getMonthlySummary: vi.fn(),
}))
vi.mock('@/composables/useChartJs', () => ({ BarChart: { name: 'BarChart', template: '<div></div>' } }))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return { ...actual, ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }
})

import { getClassrooms } from '@/api/classrooms'
import { getAttendanceOverview, getMonthlySummary } from '@/api/studentAttendance'
import StudentAttendanceView from '@/views/StudentAttendanceView.vue'

const globalStubs = {
  stubs: {
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
    AttendanceBatchPanel: { name: 'AttendanceBatchPanel', template: '<div></div>' },
    AdminListToolbar: true,
  },
}

describe('StudentAttendanceView 載入失敗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMobile.value = false
    vi.mocked(getClassrooms).mockResolvedValue({ data: [] } as never)
    vi.mocked(getAttendanceOverview).mockResolvedValue({ data: { classrooms: [] } } as never)
  })

  it('總覽失敗 → 顯示錯誤，不顯示人數卡片與「沒有可顯示的班級出席資料」', async () => {
    vi.mocked(getAttendanceOverview).mockRejectedValueOnce(new Error('boom'))
    const w = shallowMount(StudentAttendanceView, { global: globalStubs })
    await flushPromises()
    expect(w.find('[data-test="overview-error"]').exists()).toBe(true)
    expect(w.find('.summary-grid').exists()).toBe(false)
    expect(w.html()).not.toContain('目前沒有可顯示的班級出席資料')
  })

  it('班級清單失敗 → 顯示班級錯誤提示', async () => {
    vi.mocked(getClassrooms).mockRejectedValueOnce(new Error('boom'))
    const w = shallowMount(StudentAttendanceView, { global: globalStubs })
    await flushPromises()
    expect(w.find('[data-test="classrooms-error"]').exists()).toBe(true)
  })

  it('月分析失敗 → 顯示錯誤並清掉上一個月的資料', async () => {
    const w = shallowMount(StudentAttendanceView, { global: globalStubs })
    await flushPromises()
    vi.mocked(getMonthlySummary).mockRejectedValueOnce(new Error('boom'))
    const vm = w.vm as unknown as { monthlyClassroomId: number | null; fetchMonthly: () => Promise<void>; monthlyData: unknown }
    vm.monthlyClassroomId = 1
    await vm.fetchMonthly()
    await flushPromises()
    expect(w.find('[data-test="monthly-error"]').exists()).toBe(true)
    expect(vm.monthlyData).toBeNull()
  })
})
