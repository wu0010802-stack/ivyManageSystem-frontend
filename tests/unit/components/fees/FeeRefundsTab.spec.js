import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const getFeeRecords = vi.fn()
const getRefundedFeeRecords = vi.fn()
const getFeePeriods = vi.fn()

vi.mock('@/api/fees', () => ({
  getFeeRecords: (...a) => getFeeRecords(...a),
  getRefundedFeeRecords: (...a) => getRefundedFeeRecords(...a),
  getFeePeriods: (...a) => getFeePeriods(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/components/fees/RefundSuggestModal.vue', () => ({
  default: {
    name: 'RefundSuggestModal',
    props: ['modelValue', 'record'],
    emits: ['update:modelValue', 'refunded'],
    template: '<div data-testid="refund-suggest-modal" />',
  },
}))

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  'el-table': { template: '<div class="el-table-stub"><slot /><slot name="empty" /></div>' },
  'el-table-column': { template: '<div><slot :row="{}" /></div>' },
  'el-button': {
    inheritAttrs: false,
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" data-testid="picker-dialog"><slot /><slot name="footer" /></div>',
  },
}

const flushPromises = async () => {
  // 多輪 microtask flush（內部有 worker fan-out + onMounted + watcher）
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
}

import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'

function mountTab(props = {}) {
  return mount(FeeRefundsTab, {
    props: {
      periodOptions: ['2025-1', '2024-2'],
      ...props,
    },
    global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
  })
}

describe('FeeRefundsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    getRefundedFeeRecords.mockResolvedValue({ total: 0, page: 1, page_size: 20, items: [] })
    getFeePeriods.mockResolvedValue(['2025-1'])
  })

  it('mount 後呼叫 GET /fees/refunds（伺服器分頁）並映射彙總列（Phase 2，2026-08-17）', async () => {
    getRefundedFeeRecords.mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          record_id: 1,
          student_id: 10,
          student_name: '小明',
          classroom_name: '小班',
          period: '2025-1',
          fee_item_name: '學費',
          fee_type: 'monthly',
          amount_due: 5000,
          amount_paid: 5000,
          total_refunded: 1200,
          refund_count: 1,
          latest_refund_at: '2026-05-10T10:00:00',
          refunds: [
            { id: 11, amount: 1200, reason: '中途離園', notes: '', refunded_by: 'admin',
              refunded_at: '2026-05-10T10:00:00' },
          ],
        },
      ],
    })

    const wrapper = mountTab()
    await flushPromises()

    expect(getRefundedFeeRecords).toHaveBeenCalled()
    const params = getRefundedFeeRecords.mock.calls[0][0]
    expect(params.page).toBe(1)

    const rows = wrapper.vm.$.setupState.refundedRows
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(1) // record_id 映射為 id（row-key 與再次退費沿用）
    expect(rows[0]._refunds.length).toBe(1)
    expect(rows[0]._total_refunded).toBe(1200)
    expect(rows[0]._latest_refund_at).toBe('2026-05-10T10:00:00')
    expect(wrapper.vm.$.setupState.total).toBe(1)
  })

  it('「+ 新增退費」按鈕打開 picker dialog', async () => {
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.vm.$.setupState.pickerVisible).toBe(false)
    wrapper.vm.$.setupState.openNewRefundDialog()
    await nextTick()
    expect(wrapper.vm.$.setupState.pickerVisible).toBe(true)
  })

  it('在 picker 中選擇 record 後關閉 picker 並開啟 RefundSuggestModal', async () => {
    const wrapper = mountTab()
    await flushPromises()

    wrapper.vm.$.setupState.openNewRefundDialog()
    await nextTick()
    expect(wrapper.vm.$.setupState.pickerVisible).toBe(true)

    const targetRow = { id: 99, student_name: '阿明', amount_paid: 3000, fee_type: 'monthly' }
    wrapper.vm.$.setupState.onPickRecord(targetRow)
    await nextTick()

    expect(wrapper.vm.$.setupState.pickerVisible).toBe(false)
    expect(wrapper.vm.$.setupState.refundModalVisible).toBe(true)
    expect(wrapper.vm.$.setupState.refundTarget).toEqual(targetRow)
  })

  it('「再次退費」直接帶 row 開 RefundSuggestModal', async () => {
    const wrapper = mountTab()
    await flushPromises()

    const row = { id: 7, student_name: '小華', amount_paid: 2000, fee_type: 'registration' }
    wrapper.vm.$.setupState.openRefundForRow(row)
    await nextTick()

    expect(wrapper.vm.$.setupState.refundModalVisible).toBe(true)
    expect(wrapper.vm.$.setupState.refundTarget).toEqual(row)
  })

  it('載入失敗 → loadError 持久呈現，重試成功後恢復（伺服器分頁單一請求語意）', async () => {
    getRefundedFeeRecords.mockRejectedValueOnce(new Error('500'))
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.vm.$.setupState.loadError).toBe(true)

    getRefundedFeeRecords.mockResolvedValue({ total: 0, page: 1, page_size: 20, items: [] })
    await wrapper.vm.$.setupState.loadRefundedRecords()
    await flushPromises()
    expect(wrapper.vm.$.setupState.loadError).toBe(false)
  })
})
