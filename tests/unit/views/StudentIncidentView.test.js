import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentIncidentView from '@/views/StudentIncidentView.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// ── API mocks ──────────────────────────────────────────────────────────────
const getIncidents = vi.fn()
const createIncident = vi.fn()
const updateIncident = vi.fn()
const deleteIncident = vi.fn()

vi.mock('@/api/studentIncidents', () => ({
  getIncidents: (...a) => getIncidents(...a),
  createIncident: (...a) => createIncident(...a),
  updateIncident: (...a) => updateIncident(...a),
  deleteIncident: (...a) => deleteIncident(...a),
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
  INCIDENT_TYPES: ['身體健康', '意外受傷', '行為觀察', '其他'],
  SEVERITIES: ['輕微', '中度', '嚴重'],
  INCIDENT_TYPE_TAG: {},
  SEVERITY_TAG: {},
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
  'el-switch': { template: '<button />' },
  'el-checkbox': { template: '<input type="checkbox" />' },
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function mountView() {
  return mount(StudentIncidentView, {
    global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('StudentIncidentView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    getClassrooms.mockResolvedValue({ data: [] })
    getIncidents.mockResolvedValue({ data: { items: [], total: 0 } })
    ElMessageBox.confirm.mockResolvedValue('confirm')
  })

  it('掛載後呼叫 getIncidents 和 getClassrooms', async () => {
    mountView()
    await flushPromises()

    expect(getIncidents).toHaveBeenCalled()
    expect(getClassrooms).toHaveBeenCalled()
  })

  it('submitForm 在新增模式呼叫 createIncident', async () => {
    createIncident.mockResolvedValue({ data: { id: 10 } })
    getIncidents.mockResolvedValue({ data: { items: [], total: 0 } })

    const wrapper = mountView()
    await flushPromises()
    vi.clearAllMocks()
    createIncident.mockResolvedValue({ data: { id: 10 } })
    getIncidents.mockResolvedValue({ data: { items: [], total: 0 } })

    // 設為新增模式並填入必填欄位
    wrapper.vm.$.setupState.dialogMode = 'create'
    Object.assign(wrapper.vm.$.setupState.form, {
      student_id: 2,
      incident_type: '意外受傷',
      occurred_at: '2025-11-01T09:00:00',
      description: '在操場跌倒',
    })

    await wrapper.vm.$.setupState.submitForm()
    await flushPromises()

    expect(createIncident).toHaveBeenCalled()
  })

  it('handleDelete 呼叫 deleteIncident 後刷新列表', async () => {
    deleteIncident.mockResolvedValue({})
    getIncidents.mockResolvedValue({ data: { items: [], total: 0 } })

    const wrapper = mountView()
    await flushPromises()
    vi.clearAllMocks()
    deleteIncident.mockResolvedValue({})
    getIncidents.mockResolvedValue({ data: { items: [], total: 0 } })

    const row = { id: 3, student_name: '林小花' }
    await wrapper.vm.$.setupState.handleDelete(row)
    await flushPromises()

    expect(deleteIncident).toHaveBeenCalledWith(3)
    expect(getIncidents).toHaveBeenCalled()
  })

  it('toggleParentNotified 呼叫 updateIncident 並切換 parent_notified 旗標', async () => {
    updateIncident.mockResolvedValue({})

    const wrapper = mountView()
    await flushPromises()

    const row = { id: 1, parent_notified: false }
    await wrapper.vm.$.setupState.toggleParentNotified(row)

    expect(updateIncident).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ parent_notified: true }),
    )
    expect(row.parent_notified).toBe(true)
  })

  it('handleSearch 重置 currentPage=1 並重新載入', async () => {
    const wrapper = mountView()
    await flushPromises()
    vi.clearAllMocks()
    getIncidents.mockResolvedValue({ data: { items: [], total: 0 } })

    // 先設為第 2 頁
    wrapper.vm.$.setupState.currentPage = 2

    wrapper.vm.$.setupState.handleSearch()
    await flushPromises()

    expect(wrapper.vm.$.setupState.currentPage).toBe(1)
    expect(getIncidents).toHaveBeenCalled()
  })
})
