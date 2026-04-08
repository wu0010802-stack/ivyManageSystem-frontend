import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentAssessmentView from '@/views/StudentAssessmentView.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// ── API mocks ──────────────────────────────────────────────────────────────
const getAssessments = vi.fn()
const createAssessment = vi.fn()
const updateAssessment = vi.fn()
const deleteAssessment = vi.fn()

vi.mock('@/api/studentAssessments', () => ({
  getAssessments: (...a) => getAssessments(...a),
  createAssessment: (...a) => createAssessment(...a),
  updateAssessment: (...a) => updateAssessment(...a),
  deleteAssessment: (...a) => deleteAssessment(...a),
}))

const getClassrooms = vi.fn()
vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...a) => getClassrooms(...a),
}))

const getStudents = vi.fn()
vi.mock('@/api/students', () => ({
  getStudents: (...a) => getStudents(...a),
}))

vi.mock('@/utils/error', () => ({
  apiError: (e) => e?.response?.data?.detail || '操作失敗',
}))

vi.mock('@/constants/studentRecords', () => ({
  ASSESSMENT_TYPES: ['期中', '期末', '學期'],
  DOMAINS: [],
  RATINGS: [],
  RATING_TAG: {},
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  'el-card': { template: '<div><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-pagination': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-date-picker': { template: '<input />' },
  'el-tooltip': { template: '<span><slot /></span>' },
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function mountView() {
  return mount(StudentAssessmentView, {
    global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('StudentAssessmentView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    getClassrooms.mockResolvedValue({ data: [] })
    getAssessments.mockResolvedValue({ data: { items: [], total: 0 } })
    ElMessageBox.confirm.mockResolvedValue('confirm')
  })

  it('掛載後呼叫 getAssessments 和 getClassrooms', async () => {
    mountView()
    await flushPromises()

    expect(getAssessments).toHaveBeenCalled()
    expect(getClassrooms).toHaveBeenCalled()
  })

  it('handleSearch 重置 currentPage=1 並重新載入', async () => {
    const wrapper = mountView()
    await flushPromises()
    vi.clearAllMocks()
    getAssessments.mockResolvedValue({ data: { items: [], total: 0 } })

    // 先設為第 3 頁
    wrapper.vm.$.setupState.currentPage = 3

    wrapper.vm.$.setupState.handleSearch()
    await flushPromises()

    expect(wrapper.vm.$.setupState.currentPage).toBe(1)
    expect(getAssessments).toHaveBeenCalled()
  })

  it('submitForm 在新增模式呼叫 createAssessment', async () => {
    createAssessment.mockResolvedValue({ data: { id: 99 } })
    getAssessments.mockResolvedValue({ data: { items: [], total: 0 } })

    const wrapper = mountView()
    await flushPromises()
    vi.clearAllMocks()
    createAssessment.mockResolvedValue({ data: { id: 99 } })
    getAssessments.mockResolvedValue({ data: { items: [], total: 0 } })

    // 設為新增模式並填入必填欄位
    wrapper.vm.$.setupState.dialogMode = 'create'
    Object.assign(wrapper.vm.$.setupState.form, {
      student_id: 1,
      semester: '2025上',
      assessment_type: '期中',
      content: '整體表現良好',
      assessment_date: '2025-11-01',
    })

    await wrapper.vm.$.setupState.submitForm()
    await flushPromises()

    expect(createAssessment).toHaveBeenCalled()
  })

  it('handleDelete 呼叫 deleteAssessment 後刷新列表', async () => {
    deleteAssessment.mockResolvedValue({})
    getAssessments.mockResolvedValue({ data: { items: [], total: 0 } })

    const wrapper = mountView()
    await flushPromises()
    vi.clearAllMocks()
    deleteAssessment.mockResolvedValue({})
    getAssessments.mockResolvedValue({ data: { items: [], total: 0 } })

    const row = { id: 1, student_name: '王小明' }
    await wrapper.vm.$.setupState.handleDelete(row)
    await flushPromises()

    expect(deleteAssessment).toHaveBeenCalledWith(1)
    expect(getAssessments).toHaveBeenCalled()
  })
})
