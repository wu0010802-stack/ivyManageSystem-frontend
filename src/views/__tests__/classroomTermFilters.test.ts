/**
 * 「按班級篩選既有資料」的頁面，班級下拉必須涵蓋非當期學年的班
 * （2026-07-30 根因的第六、七處：請假清單、身障幼生 IEP）。
 *
 * 這類頁面篩的是既有資料，而資料上的 classroom_id 不跟學期。只給當期班級時，
 * 學生已編入下學年班級 → 想篩的班在下拉裡根本不存在。
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

vi.mock('@/api/studentLeaves', () => ({
  listStudentLeaves: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}))

vi.mock('@/api/govMoe', () => ({
  listIeps: vi.fn().mockResolvedValue({ data: [] }),
  createIep: vi.fn(),
  updateIep: vi.fn(),
  deleteIep: vi.fn(),
  exportIepDocx: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import StudentLeavesListView from '@/views/StudentLeavesListView.vue'
import IepView from '@/views/admin/gov-reports/IepView.vue'

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

type Vm = { classrooms: { id: number; name: string; label: string }[] }

const cases = [
  { name: 'StudentLeavesListView', component: StudentLeavesListView },
  { name: 'IepView', component: IepView },
]

describe.each(cases)('$name 班級篩選涵蓋跨學期', ({ component }) => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('班級下拉含非當期學年的班，同名班帶學期標籤', async () => {
    const wrapper = shallowMount(component, { global: globalConfig })
    await flushPromises()
    const vm = wrapper.vm as unknown as Vm
    expect(vm.classrooms.map(c => c.label)).toEqual([
      '向日葵（114學年度下學期）',
      '天堂鳥',
      '向日葵（115學年度上學期）',
    ])
  })
})
