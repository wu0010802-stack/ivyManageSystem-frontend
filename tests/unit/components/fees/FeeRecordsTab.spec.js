import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// ── API mocks ──────────────────────────────────────────────────────────────
const getFeeRecords = vi.fn()
const payFeeRecord = vi.fn()
const getFeeSummary = vi.fn()

vi.mock('@/api/fees', () => ({
  getFeeRecords: (...a) => getFeeRecords(...a),
  payFeeRecord: (...a) => payFeeRecord(...a),
  getFeeSummary: (...a) => getFeeSummary(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/components/fees/RefundSuggestModal.vue', () => ({
  default: { name: 'RefundSuggestModal', template: '<div />' },
}))

vi.mock('@/utils/format', () => ({
  todayISO: () => '2026-05-14',
}))

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
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
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'

function mountTab(props = {}) {
  return mount(FeeRecordsTab, {
    props: {
      periodOptions: ['2025-1', '2024-2'],
      classrooms: [],
      ...props,
    },
    global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
  })
}

describe('FeeRecordsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getFeeSummary.mockResolvedValue({
      total_count: 0, total_due: 0, total_paid: 0,
      paid_count: 0, partial_count: 0, total_unpaid: 0, unpaid_count: 0,
    })
  })

  it('submitPay 呼叫 payFeeRecord 後刷新記錄', async () => {
    payFeeRecord.mockResolvedValue({})

    const wrapper = mountTab()
    await flushPromises()
    vi.clearAllMocks()
    payFeeRecord.mockResolvedValue({})
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getFeeSummary.mockResolvedValue({
      total_count: 0, total_due: 0, total_paid: 0,
      paid_count: 0, partial_count: 0, total_unpaid: 0, unpaid_count: 0,
    })

    wrapper.vm.$.setupState.payingRecord = {
      id: 5,
      student_name: '王小明',
      classroom_name: '小班',
      fee_item_name: '學費',
      amount_due: 5000,
    }
    wrapper.vm.$.setupState.payFormRef = {
      validate: vi.fn().mockResolvedValue(true),
    }

    await wrapper.vm.$.setupState.submitPay()
    await flushPromises()

    expect(payFeeRecord).toHaveBeenCalledWith(5, expect.any(Object))
    expect(getFeeRecords).toHaveBeenCalled()
  })

  it('fetchRecords 會把 student_name 與 partial 狀態一起送到 records/summary', async () => {
    const wrapper = mountTab()
    await flushPromises()
    vi.clearAllMocks()

    wrapper.vm.$.setupState.recordFilter = {
      period: '2025-1',
      classroom_name: '大班A',
      status: 'partial',
      student_name: '小明',
    }
    wrapper.vm.$.setupState.recordPage = 2
    wrapper.vm.$.setupState.recordPageSize = 20

    await wrapper.vm.$.setupState.fetchRecords()
    await flushPromises()

    const expectedParams = {
      page: 2,
      page_size: 20,
      period: '2025-1',
      classroom_name: '大班A',
      status: 'partial',
      student_name: '小明',
    }

    expect(getFeeRecords).toHaveBeenCalledWith(expectedParams)
    expect(getFeeSummary).toHaveBeenCalledWith(expectedParams)
  })

  it('resetRecordFilters 會清空條件並回到第一頁', async () => {
    const wrapper = mountTab()
    await flushPromises()
    vi.clearAllMocks()

    wrapper.vm.$.setupState.recordFilter = {
      period: '2025-1',
      classroom_name: '大班A',
      status: 'partial',
      student_name: '小明',
    }
    wrapper.vm.$.setupState.recordPage = 3

    await wrapper.vm.$.setupState.resetRecordFilters()
    await flushPromises()

    expect(wrapper.vm.$.setupState.recordPage).toBe(1)
    expect(wrapper.vm.$.setupState.recordFilter).toEqual({
      period: '',
      classroom_name: '',
      status: '',
      student_name: '',
    })
    expect(getFeeRecords).toHaveBeenCalledWith({ page: 1, page_size: 50 })
    expect(getFeeSummary).toHaveBeenCalledWith({ page: 1, page_size: 50 })
  })

  it('expose fetchRecords 給父層', async () => {
    const wrapper = mountTab()
    await flushPromises()
    expect(typeof wrapper.vm.fetchRecords).toBe('function')
  })
})
