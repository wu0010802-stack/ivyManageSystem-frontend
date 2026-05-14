import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const getFeeRecords = vi.fn()
const getFeeRefunds = vi.fn()
const getFeePeriods = vi.fn()

vi.mock('@/api/fees', () => ({
  getFeeRecords: (...a) => getFeeRecords(...a),
  getFeeRefunds: (...a) => getFeeRefunds(...a),
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
    getFeeRefunds.mockResolvedValue({
      record_id: 0,
      student_name: '',
      total_refunded: 0,
      refunds: [],
    })
    getFeePeriods.mockResolvedValue(['2025-1'])
  })

  it('mount 後呼叫 getFeeRecords + getFeeRefunds 並只保留有退費的 record', async () => {
    getFeeRecords.mockResolvedValue({
      items: [
        { id: 1, student_name: '小明', classroom_name: '小班', period: '2025-1',
          fee_item_name: '學費', amount_paid: 5000 },
        { id: 2, student_name: '小華', classroom_name: '中班', period: '2025-1',
          fee_item_name: '材料費', amount_paid: 1000 },
        { id: 3, student_name: '未繳', classroom_name: '大班', period: '2025-1',
          fee_item_name: '學費', amount_paid: 0 }, // 未繳：不會跑 refunds
      ],
      total: 3,
    })
    getFeeRefunds.mockImplementation((id) => {
      if (id === 1) {
        return Promise.resolve({
          record_id: 1,
          student_name: '小明',
          total_refunded: 1200,
          refunds: [
            { id: 11, amount: 1200, reason: '中途離園', notes: '', refunded_by: 'admin',
              refunded_at: '2026-05-10T10:00:00' },
          ],
        })
      }
      // record 2 沒退費紀錄
      return Promise.resolve({ record_id: id, student_name: '', total_refunded: 0, refunds: [] })
    })

    const wrapper = mountTab()
    await flushPromises()
    // onMounted 內 fetch 可能尚未跑完，明確再觸發一次以等待 settle
    await wrapper.vm.$.setupState.loadRefundedRecords()
    await flushPromises()

    // 只對有繳費的兩筆呼叫 getFeeRefunds（id=3 amount_paid=0 略過）
    expect(getFeeRecords).toHaveBeenCalled()
    expect(getFeeRefunds).toHaveBeenCalledWith(1)
    expect(getFeeRefunds).toHaveBeenCalledWith(2)
    expect(getFeeRefunds).not.toHaveBeenCalledWith(3)

    // 結果只剩 record 1（有 refund）
    const rows = wrapper.vm.$.setupState.refundedRows
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(1)
    expect(rows[0]._refunds.length).toBe(1)
    expect(rows[0]._total_refunded).toBe(1200)
    expect(rows[0]._latest_refund_at).toBe('2026-05-10T10:00:00')
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

  it('getFeeRefunds 失敗時不阻斷其他 record 顯示', async () => {
    getFeeRecords.mockResolvedValue({
      items: [
        { id: 1, student_name: '小明', amount_paid: 5000, period: '2025-1', fee_item_name: '學費' },
        { id: 2, student_name: '小華', amount_paid: 5000, period: '2025-1', fee_item_name: '學費' },
      ],
      total: 2,
    })
    getFeeRefunds.mockImplementation((id) => {
      if (id === 1) return Promise.reject(new Error('500'))
      return Promise.resolve({
        record_id: 2,
        total_refunded: 500,
        refunds: [
          { id: 21, amount: 500, reason: '行政錯誤', refunded_by: 'admin',
            refunded_at: '2026-05-12T12:00:00' },
        ],
      })
    })

    const wrapper = mountTab()
    await flushPromises()
    await wrapper.vm.$.setupState.loadRefundedRecords()
    await flushPromises()

    const rows = wrapper.vm.$.setupState.refundedRows
    // record 1 失敗 → 不會出現；record 2 成功 → 出現
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(2)
  })
})
