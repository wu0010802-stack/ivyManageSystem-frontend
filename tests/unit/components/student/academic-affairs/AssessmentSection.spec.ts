import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import AssessmentSection from '@/components/student/academic-affairs/AssessmentSection.vue'
import {
  useAcademicAffairsFilters,
  ACADEMIC_AFFAIRS_FILTERS_KEY,
} from '@/composables/useAcademicAffairsFilters'

vi.mock('@/api/studentAssessments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/studentAssessments')>()
  return {
    ...actual,
    getAssessments: vi.fn(() =>
      Promise.resolve({
        data: [
          { id: 1, student_name: '吳逸倫', assessment_type: '形成', domain: '認知', rating: 'A' },
          { id: 2, student_name: '王小明', assessment_type: '總結', domain: '語文', rating: 'B' },
        ],
      }),
    ),
  }
})

// 編輯對話框內部依賴多，stub 掉只驗證本元件的觸發鈕／抽屜結構
vi.mock('@/components/student/AssessmentEditorDialog.vue', () => ({
  default: { name: 'AssessmentEditorDialog', render: () => null },
}))

// el-drawer 預設 teleport 到 body 且開啟才 lazy render；改用尊重 modelValue 的 inline stub
// → 關閉時不渲染內容、開啟時 inline 渲染，便於直接 query
const ElDrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue'],
  template: '<div v-if="modelValue" class="el-drawer-stub"><slot /></div>',
}

const mountSection = () => {
  const ctx = useAcademicAffairsFilters({ classroomId: 1 })
  return mount(AssessmentSection, {
    global: {
      plugins: [ElementPlus],
      provide: { [ACADEMIC_AFFAIRS_FILTERS_KEY as symbol]: ctx },
      stubs: { 'el-drawer': ElDrawerStub },
    },
  })
}

describe('AssessmentSection（評量降為抽屜次要區）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('預設只渲染精簡觸發鈕，含名稱與即時數量徽章', async () => {
    const wrapper = mountSection()
    await flushPromises()

    const trigger = wrapper.find('.record-trigger')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain('評量')
    // 兩筆評量 → 徽章顯示 2
    expect(wrapper.find('.record-trigger-badge').text()).toContain('2')

    // 抽屜尚未開啟 → 新增按鈕不在 DOM
    expect(wrapper.text()).not.toContain('新增評量')
  })

  it('點觸發鈕後開啟抽屜，內含新增鈕與資料表', async () => {
    const wrapper = mountSection()
    await flushPromises()

    await wrapper.find('.record-trigger').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('新增評量')
    // 表格內容（學生姓名）出現在抽屜內
    expect(wrapper.text()).toContain('吳逸倫')
  })
})
