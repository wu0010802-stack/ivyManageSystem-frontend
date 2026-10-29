/**
 * 學生儀表板請假／評量／事件區塊的「查看全部 ↗」入口（後台 IA 重整 M3）。
 *
 * /student-leaves、/student-assessments、/student-incidents 沒有選單也沒有入站連結，
 * SectionCard 的 openFullRoute prop 先前從未被傳入。這裡釘住三個區塊都連到對應完整頁。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import LeaveSection from '@/components/student/academic-affairs/LeaveSection.vue'
import AssessmentSection from '@/components/student/academic-affairs/AssessmentSection.vue'
import IncidentSection from '@/components/student/academic-affairs/IncidentSection.vue'
import {
  useAcademicAffairsFilters,
  ACADEMIC_AFFAIRS_FILTERS_KEY,
} from '@/composables/useAcademicAffairsFilters'

vi.mock('@/api/studentLeaves', () => ({
  listStudentLeaves: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
}))
vi.mock('@/api/studentAssessments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/studentAssessments')>()),
  getAssessments: vi.fn(() => Promise.resolve({ data: [] })),
}))
vi.mock('@/api/studentIncidents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/studentIncidents')>()),
  getIncidents: vi.fn(() => Promise.resolve({ data: [] })),
}))
vi.mock('@/components/student/AssessmentEditorDialog.vue', () => ({
  default: { name: 'AssessmentEditorDialog', render: () => null },
}))
vi.mock('@/components/student/IncidentEditorDialog.vue', () => ({
  default: { name: 'IncidentEditorDialog', render: () => null },
}))

// el-drawer 預設 teleport 且開啟才 render；改用 inline stub 便於直接 query
const ElDrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue'],
  template: '<div v-if="modelValue" class="el-drawer-stub"><slot /></div>',
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

const mountSection = (component: unknown) => {
  const ctx = useAcademicAffairsFilters({ classroomId: 1 })
  return mount(component as never, {
    global: {
      plugins: [ElementPlus, router],
      provide: { [ACADEMIC_AFFAIRS_FILTERS_KEY as symbol]: ctx },
      stubs: { 'el-drawer': ElDrawerStub },
    },
  })
}

describe('儀表板區塊「查看全部」入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('請假區塊標頭連到 /student-leaves（新分頁）', async () => {
    const wrapper = mountSection(LeaveSection)
    await flushPromises()
    const link = wrapper.find('a.open-full-link')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('查看全部請假')
    expect(link.attributes('href')).toBe('/student-leaves')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('評量抽屜內有連到 /student-assessments 的入口，仍保有新增鈕', async () => {
    const wrapper = mountSection(AssessmentSection)
    await flushPromises()
    await wrapper.find('.record-trigger').trigger('click')
    await flushPromises()
    const link = wrapper.find('a.open-full-link')
    expect(link.text()).toContain('查看全部評量')
    expect(link.attributes('href')).toBe('/student-assessments')
    expect(wrapper.text()).toContain('新增評量')
  })

  it('事件抽屜內有連到 /student-incidents 的入口，仍保有新增鈕', async () => {
    const wrapper = mountSection(IncidentSection)
    await flushPromises()
    await wrapper.find('.record-trigger').trigger('click')
    await flushPromises()
    const link = wrapper.find('a.open-full-link')
    expect(link.text()).toContain('查看全部事件')
    expect(link.attributes('href')).toBe('/student-incidents')
    expect(wrapper.text()).toContain('新增事件')
  })
})
