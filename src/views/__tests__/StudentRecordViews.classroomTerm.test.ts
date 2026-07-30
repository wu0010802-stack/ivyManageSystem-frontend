/**
 * 學生評量／學生事件兩頁的班級來源跨學期正確性（2026-07-30 根因的第三、四處）。
 *
 * 兩頁結構相同：篩選下拉 + dialog 內「先選班級再選學生」，而 openEdit 會把既有紀錄的
 * classroom_id 塞回那個下拉。只拿當期學期的班級時，暑假期間學生已編入下學年班級 →
 * 新建時依班級抓不到任何學生（功能直接斷掉），編輯既有紀錄時班級欄顯示空白。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const ALL_CLASSROOMS = [
  { id: 24, name: '向日葵', school_year: 114, semester: 2, semester_label: '114學年度下學期' },
  { id: 13, name: '天堂鳥', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
  { id: 22, name: '向日葵', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
]
const CURRENT_TERM_CLASSROOMS = ALL_CLASSROOMS.filter(c => c.school_year === 114)

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn((params?: Record<string, unknown>) =>
    Promise.resolve({
      data: params?.current_only === false ? ALL_CLASSROOMS : CURRENT_TERM_CLASSROOMS,
    }),
  ),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

vi.mock('@/api/studentAssessments', () => ({
  getAssessments: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createAssessment: vi.fn(),
  updateAssessment: vi.fn(),
  deleteAssessment: vi.fn(),
}))

vi.mock('@/api/studentIncidents', () => ({
  getIncidents: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  deleteIncident: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import StudentAssessmentView from '@/views/StudentAssessmentView.vue'
import StudentIncidentView from '@/views/StudentIncidentView.vue'

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

type Vm = {
  classrooms: { id: number; name: string; label?: string }[]
  openEdit: (row: Record<string, unknown>) => void
  dialogClassroom: number | null
}

const cases = [
  { name: 'StudentAssessmentView', component: StudentAssessmentView },
  { name: 'StudentIncidentView', component: StudentIncidentView },
]

describe.each(cases)('$name 班級來源跨學期', ({ component }) => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const mountView = async () => {
    const wrapper = shallowMount(component, { global: globalConfig })
    await flushPromises()
    return wrapper
  }

  it('班級選項涵蓋非當期學年的班，同名班帶學期標籤', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm
    expect(vm.classrooms.map(c => c.label ?? c.name)).toEqual([
      '向日葵（114學年度下學期）',
      '天堂鳥',
      '向日葵（115學年度上學期）',
    ])
  })

  it('編輯既有紀錄時，非當期班級的 id 在選項中找得到（班級欄不會空白）', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm
    vm.openEdit({ id: 1, student_id: 7, student_name: '王小明', classroom_id: 13 })
    await flushPromises()
    expect(vm.dialogClassroom).toBe(13)
    expect(vm.classrooms.some(c => c.id === 13)).toBe(true)
  })
})
