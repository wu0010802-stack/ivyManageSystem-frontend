import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const getFeeItems = vi.fn()
const getFeePeriods = vi.fn()
const createFeeItem = vi.fn()
const updateFeeItem = vi.fn()
const deleteFeeItem = vi.fn()
const generateFeeRecords = vi.fn()
const getFeeRecords = vi.fn()
const payFeeRecord = vi.fn()
const getFeeSummary = vi.fn()

vi.mock('@/api/fees', () => ({
  getFeeItems: (...a) => getFeeItems(...a),
  getFeePeriods: (...a) => getFeePeriods(...a),
  createFeeItem: (...a) => createFeeItem(...a),
  updateFeeItem: (...a) => updateFeeItem(...a),
  deleteFeeItem: (...a) => deleteFeeItem(...a),
  generateFeeRecords: (...a) => generateFeeRecords(...a),
  getFeeRecords: (...a) => getFeeRecords(...a),
  payFeeRecord: (...a) => payFeeRecord(...a),
  getFeeSummary: (...a) => getFeeSummary(...a),
}))

const getClassrooms = vi.fn()
vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...a) => getClassrooms(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// ── stub children that pull in heavy dependencies ──────────────────────────
// FeeRecordsTab：暴露 fetchRecords / refreshFeeItems 讓父層觸發
vi.mock('@/components/fees/FeeRecordsTab.vue', () => {
  const fetchRecords = vi.fn()
  const refreshFeeItems = vi.fn()
  return {
    __fetchRecords: fetchRecords,
    __refreshFeeItems: refreshFeeItems,
    default: {
      name: 'FeeRecordsTab',
      props: ['periodOptions', 'classrooms'],
      setup(_, { expose }) {
        expose({ fetchRecords, refreshFeeItems })
        return {}
      },
      template: '<div data-testid="fee-records-tab" />',
    },
  }
})

vi.mock('@/components/fees/FeeTemplateTab.vue', () => ({
  default: { name: 'FeeTemplateTab', template: '<div data-testid="fee-template-tab" />' },
}))

vi.mock('@/components/fees/FeeGenerateModal.vue', () => ({
  default: {
    name: 'FeeGenerateModal',
    props: ['modelValue'],
    emits: ['update:modelValue', 'generated'],
    template: '<div data-testid="fee-generate-modal" />',
  },
}))

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-input': { template: '<input />' },
  'el-input-number': { props: ['modelValue'], template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-pagination': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-date-picker': { template: '<input />' },
  'el-switch': true,
  'el-icon': { template: '<span><slot /></span>' },
  Plus: true,
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

import StudentFeeView from '@/views/StudentFeeView.vue'
import * as FeeRecordsTabModule from '@/components/fees/FeeRecordsTab.vue'

function mountFeeView() {
  return mount(StudentFeeView, {
    global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('StudentFeeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    getFeeItems.mockResolvedValue([])
    getFeePeriods.mockResolvedValue(['2025-1', '2024-2'])
    getClassrooms.mockResolvedValue({ data: [] })
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getFeeSummary.mockResolvedValue({
      total_count: 0, total_due: 0, total_paid: 0,
      paid_count: 0, partial_count: 0, total_unpaid: 0, unpaid_count: 0,
    })
  })

  it('掛載後呼叫 getFeeItems、getFeePeriods 和 getClassrooms', async () => {
    mountFeeView()
    await flushPromises()

    expect(getFeeItems).toHaveBeenCalled()
    expect(getFeePeriods).toHaveBeenCalled()
    expect(getClassrooms).toHaveBeenCalled()
  })

  it('切換至「繳費記錄」Tab 時呼叫子元件 fetchRecords', async () => {
    const wrapper = mountFeeView()
    await flushPromises()
    FeeRecordsTabModule.__fetchRecords.mockClear()

    // 觸發 watch(activeTab)
    wrapper.vm.$.setupState.activeTab = 'records'
    await nextTick()
    await flushPromises()

    expect(FeeRecordsTabModule.__fetchRecords).toHaveBeenCalled()
  })

  it('submitItem 在新增模式呼叫 createFeeItem', async () => {
    createFeeItem.mockResolvedValue({})
    getFeeItems.mockResolvedValue([])

    const wrapper = mountFeeView()
    await flushPromises()
    vi.clearAllMocks()
    createFeeItem.mockResolvedValue({})
    getFeeItems.mockResolvedValue([])

    // 確保是新增模式
    wrapper.vm.$.setupState.editingItem = null
    // mock 表單驗證通過
    wrapper.vm.$.setupState.itemFormRef = {
      validate: vi.fn().mockResolvedValue(true),
    }

    await wrapper.vm.$.setupState.submitItem()
    await flushPromises()

    expect(createFeeItem).toHaveBeenCalled()
  })

  it('submitItem 成功後呼叫子元件 refreshFeeItems', async () => {
    const wrapper = mountFeeView()
    await flushPromises()
    vi.clearAllMocks()
    createFeeItem.mockResolvedValue({})
    getFeeItems.mockResolvedValue([])
    getFeePeriods.mockResolvedValue([])
    FeeRecordsTabModule.__refreshFeeItems.mockClear()

    wrapper.vm.$.setupState.editingItem = null
    wrapper.vm.$.setupState.itemFormRef = {
      validate: vi.fn().mockResolvedValue(true),
    }

    await wrapper.vm.$.setupState.submitItem()
    await flushPromises()

    expect(FeeRecordsTabModule.__refreshFeeItems).toHaveBeenCalled()
  })

  it('submitGenerate 後若在 records tab 則觸發子元件 fetchRecords', async () => {
    const wrapper = mountFeeView()
    await flushPromises()
    generateFeeRecords.mockResolvedValue({ created: 1, skipped: 0 })
    FeeRecordsTabModule.__fetchRecords.mockClear()

    wrapper.vm.$.setupState.activeTab = 'records'
    await nextTick()
    FeeRecordsTabModule.__fetchRecords.mockClear()

    wrapper.vm.$.setupState.generatingItem = { id: 1, name: '學費', amount: 5000, period: '2025-1' }

    await wrapper.vm.$.setupState.submitGenerate()
    await flushPromises()

    expect(generateFeeRecords).toHaveBeenCalled()
    expect(FeeRecordsTabModule.__fetchRecords).toHaveBeenCalled()
  })
})
