import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ── API mocks ──────────────────────────────────────────────────────────────
const getFeeItems = vi.fn()
const createFeeItem = vi.fn()
const updateFeeItem = vi.fn()
const deleteFeeItem = vi.fn()
const generateFeeRecords = vi.fn()
const getFeeRecords = vi.fn()
const payFeeRecord = vi.fn()
const getFeeSummary = vi.fn()

vi.mock('@/api/fees', () => ({
  getFeeItems: (...a) => getFeeItems(...a),
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
    getClassrooms.mockResolvedValue({ data: [] })
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getFeeSummary.mockResolvedValue({
      total_count: 0, total_due: 0, total_paid: 0,
      paid_count: 0, total_unpaid: 0, unpaid_count: 0,
    })
  })

  it('掛載後呼叫 getFeeItems 和 getClassrooms', async () => {
    mountFeeView()
    await flushPromises()

    expect(getFeeItems).toHaveBeenCalled()
    expect(getClassrooms).toHaveBeenCalled()
  })

  it('切換至「繳費記錄」Tab 時呼叫 getFeeRecords', async () => {
    const wrapper = mountFeeView()
    await flushPromises()
    vi.clearAllMocks()
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getFeeSummary.mockResolvedValue({
      total_count: 0, total_due: 0, total_paid: 0,
      paid_count: 0, total_unpaid: 0, unpaid_count: 0,
    })

    // 觸發 watch(activeTab)
    wrapper.vm.$.setupState.activeTab = 'records'
    await flushPromises()

    expect(getFeeRecords).toHaveBeenCalled()
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

  it('submitPay 呼叫 payFeeRecord 後刷新記錄', async () => {
    payFeeRecord.mockResolvedValue({})
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getFeeSummary.mockResolvedValue({
      total_count: 0, total_due: 0, total_paid: 0,
      paid_count: 0, total_unpaid: 0, unpaid_count: 0,
    })

    const wrapper = mountFeeView()
    await flushPromises()
    vi.clearAllMocks()
    payFeeRecord.mockResolvedValue({})
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getFeeSummary.mockResolvedValue({
      total_count: 0, total_due: 0, total_paid: 0,
      paid_count: 0, total_unpaid: 0, unpaid_count: 0,
    })

    // 設定繳費對象
    wrapper.vm.$.setupState.payingRecord = {
      id: 5,
      student_name: '王小明',
      classroom_name: '小班',
      fee_item_name: '學費',
      amount_due: 5000,
    }
    // mock 表單驗證通過
    wrapper.vm.$.setupState.payFormRef = {
      validate: vi.fn().mockResolvedValue(true),
    }

    await wrapper.vm.$.setupState.submitPay()
    await flushPromises()

    expect(payFeeRecord).toHaveBeenCalledWith(5, expect.any(Object))
    expect(getFeeRecords).toHaveBeenCalled()
  })
})
