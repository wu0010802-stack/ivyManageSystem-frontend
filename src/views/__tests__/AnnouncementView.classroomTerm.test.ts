/**
 * 公告的班級來源跨學期正確性（2026-07-30 根因的第二處）。
 *
 * 「指定班級」多選與「自訂學生」的班級分組都吃同一份班級清單。若只拿當期學期的班，
 * 暑假期間學生已編入下學年班級時：分組標籤全變「未分班」，而指定班級根本選不到
 * 學生實際所在的班（公告會發不到人）。
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
  getStudents: vi.fn().mockResolvedValue({
    data: {
      items: [
        { id: 1, name: '王小明', classroom_id: 13 }, // 115-1 天堂鳥
        { id: 2, name: '李小美', classroom_id: 22 }, // 115-1 向日葵
        { id: 3, name: '陳大文', classroom_id: 24 }, // 114-2 向日葵
      ],
    },
  }),
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { recipients: [] } }),
  replaceAnnouncementParentRecipients: vi.fn(),
  getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { recipient_ids: [] } }),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn() }),
}))

import AnnouncementView from '@/views/AnnouncementView.vue'

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

type Vm = {
  ensureStudentOptions: () => Promise<void>
  studentOptionGroups: { label: string; options: { value: number }[] }[]
  classroomOptions: { value: number; label: string }[]
}

const mountView = async () => {
  const wrapper = shallowMount(AnnouncementView, { global: globalConfig })
  await flushPromises()
  return wrapper
}

describe('AnnouncementView 班級來源跨學期', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('「指定班級」選項涵蓋非當期學年的班，同名班帶學期標籤', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm
    expect(vm.classroomOptions.map(o => o.label)).toEqual([
      '向日葵（114學年度下學期）',
      '天堂鳥',
      '向日葵（115學年度上學期）',
    ])
  })

  it('自訂學生的班級分組顯示實際班名，不再全掉進「未分班」', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm
    await vm.ensureStudentOptions()
    await flushPromises()
    const labels = vm.studentOptionGroups.map(g => g.label)
    expect(labels).toContain('天堂鳥')
    expect(labels).not.toContain('未分班')
  })
})
