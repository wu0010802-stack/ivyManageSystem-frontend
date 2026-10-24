/** F18 收據彈窗晚回應不得污染另一筆；F19 換孩子後 B 失敗不得繼續顯示 A 帳單。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({ summary: vi.fn(), records: vi.fn(), payments: vi.fn() }))
const selectedId = ref<number | null>(1)
vi.mock('@/parent/api/fees', () => ({
  getFeesSummary: mocks.summary, listFeeRecords: mocks.records, getFeePayments: mocks.payments,
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '合成孩子' }], load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId, ensureSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
import FeesView from '../FeesView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  selectedId.value = 1
  mocks.summary.mockResolvedValue({ data: { totals: { outstanding: 0, overdue: 0 }, by_student: [] } })
})
afterEach(() => { vi.restoreAllMocks() })

describe('FeesView 收據彈窗請求序號（F18）', () => {
  async function mountWithReceipt() {
    const records = [1, 2].map((id) => ({
      id, status: 'paid', fee_item_name: '合成收費' + id,
      amount_due: id * 100, amount_paid: id * 100, outstanding: 0,
    }))
    mocks.records.mockResolvedValue({ data: { items: records } })
    return mount(FeesView, { global: { stubs: {
      PullToRefresh: { template: '<div><slot /></div>' }, ChildContextHeader: true,
      DashboardHero: true, SkeletonBlock: true, MobileErrorRetry: true,
      FeeListGroup: {
        props: ['records'], emits: ['record-click'],
        template: '<div><button v-for="r in records" :key="r.id" :data-record="r.id" @click="$emit(\'record-click\', r)">{{ r.fee_item_name }}</button></div>',
      },
      FeeReceiptSheet: {
        name: 'AuditReceipt', props: ['modelValue', 'record', 'payments', 'refunds', 'loading'],
        emits: ['update:modelValue'], template: '<div />',
      },
    } } })
  }

  it('關閉 A 開 B，A 晚到不得污染 B 的付款明細', async () => {
    const wrapper = await mountWithReceipt()
    const a = deferred<unknown>()
    const b = deferred<unknown>()
    mocks.payments.mockImplementation((id: number) => id === 1 ? a.promise : b.promise)
    try {
      await flushPromises()
      await wrapper.find('[data-record="1"]').trigger('click')
      wrapper.findComponent({ name: 'AuditReceipt' }).vm.$emit('update:modelValue', false)
      await flushPromises()
      await wrapper.find('[data-record="2"]').trigger('click')
      b.resolve({ data: { payments: [{ receipt_no: 'SYNTH-B', amount: 200 }], refunds: [] } })
      await flushPromises()
      a.resolve({ data: { payments: [{ receipt_no: 'SYNTH-A', amount: 100 }], refunds: [{ id: 'A-refund' }] } })
      await flushPromises()
      const receipt = wrapper.findComponent({ name: 'AuditReceipt' })
      expect(receipt.props('record').id).toBe(2)
      expect(receipt.props('payments')).toEqual([{ receipt_no: 'SYNTH-B', amount: 200 }])
      expect(receipt.props('refunds')).toEqual([])
    } finally { wrapper.unmount() }
  })

  it('A 晚到時彈窗已關閉，不得重新開出彈窗', async () => {
    const wrapper = await mountWithReceipt()
    const a = deferred<unknown>()
    mocks.payments.mockImplementation(() => a.promise)
    try {
      await flushPromises()
      await wrapper.find('[data-record="1"]').trigger('click')
      wrapper.findComponent({ name: 'AuditReceipt' }).vm.$emit('update:modelValue', false)
      await flushPromises()
      a.resolve({ data: { payments: [{ receipt_no: 'SYNTH-A', amount: 100 }], refunds: [] } })
      await flushPromises()
      expect(wrapper.findComponent({ name: 'AuditReceipt' }).props('modelValue')).toBe(false)
    } finally { wrapper.unmount() }
  })
})

describe('FeesView 換孩子後 B 載入失敗（F19）', () => {
  it('不得繼續顯示 A 帳單，改顯示持久錯誤與重試', async () => {
    mocks.records.mockImplementation((id: number) => id === 1
      ? Promise.resolve({ data: { items: [{
        id: 1, status: 'unpaid', fee_item_name: '合成甲專屬帳單',
        amount_due: 900, amount_paid: 0, outstanding: 900,
      }] } })
      : Promise.reject(new Error('合成乙請求失敗')))
    const wrapper = mount(FeesView, { global: { stubs: {
      PullToRefresh: { template: '<div><slot /></div>' }, ChildContextHeader: true,
      DashboardHero: true, SkeletonBlock: true, FeeReceiptSheet: true,
      MobileErrorRetry: { template: '<div data-testid="audit-load-error">載入失敗</div>' },
      FeeListGroup: {
        props: ['records'],
        template: '<div class="audit-fees">{{ records.map(r => r.fee_item_name).join("|") }}</div>',
      },
    } } })
    try {
      await flushPromises()
      expect(wrapper.text()).toContain('合成甲專屬帳單')
      selectedId.value = 2
      await flushPromises()
      expect(mocks.records).toHaveBeenCalledWith(2)
      expect(wrapper.text()).not.toContain('合成甲專屬帳單')
      expect(wrapper.find('[data-testid="audit-load-error"]').exists()).toBe(true)
    } finally { wrapper.unmount() }
  })
})
