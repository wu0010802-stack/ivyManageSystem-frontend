/**
 * SPEC-022 §4.1 批次媒合面板：
 * - 只有 auto_high 進主清單且預設全勾；needs_review/unmatched 折疊呈現
 * - 送出的 items 形狀為 {payment_id, expected_digest}
 * - 結果態逐筆顯示失敗原因
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CollectionBatchDrawer from '../CollectionBatchDrawer.vue'

const apiMocks = vi.hoisted(() => ({
  batchCollectionCandidates: vi.fn(),
  batchAllocateCollectionPayments: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

const STUBS = {
  'el-drawer': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-checkbox': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input type="checkbox" v-bind="$attrs" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
  'el-collapse': { template: '<div><slot /></div>' },
  'el-collapse-item': { props: ['title'], template: '<div>{{ title }}<slot /></div>' },
}

function preview(over: Record<string, unknown> = {}) {
  return {
    items: [
      {
        payment_id: 1, customer_paid_date: '2026-09-02', channel: 'FISC',
        gross_amount: 10800, fee_amount: 0, collection_suffix: '1101',
        bill_period: '2026-09', level: 'auto_high', student_id: 5,
        student_name: '郭栩甫',
        parts: [{ part_type: 'fee_record', student_id: 5, amount: 10800,
                  label: '2026-09 繳款單 (2026-09)', fee_record_id: 283,
                  target_school_year: null, target_semester: null }],
        candidate_digest: 'a3f9c1d84b2e0577', blocked_reason: null,
      },
      {
        payment_id: 2, customer_paid_date: '2026-09-02', channel: '統一',
        gross_amount: 9500, fee_amount: 2, collection_suffix: '1102',
        bill_period: '2025-09', level: 'needs_review', student_id: 6,
        student_name: '王小明', parts: [], candidate_digest: null,
        blocked_reason: '舊期別帳號繳款（帳單期別早於當期），請人工確認',
      },
    ],
    auto_high_count: 1, needs_review_count: 1, unmatched_count: 0,
    auto_high_total: 10800, truncated: false,
    ...over,
  }
}

describe('CollectionBatchDrawer', () => {
  beforeEach(() => {
    apiMocks.batchCollectionCandidates.mockReset()
    apiMocks.batchAllocateCollectionPayments.mockReset()
  })

  async function open(data = preview()) {
    apiMocks.batchCollectionCandidates.mockResolvedValue(data)
    const wrapper = mount(CollectionBatchDrawer, {
      props: { visible: true, importId: 12 },
      global: { stubs: STUBS },
    })
    await nextTick(); await nextTick()
    return wrapper
  }

  it('只有 auto_high 進主清單且預設全勾，例外折疊只顯示筆數', async () => {
    const wrapper = await open()
    expect(wrapper.findAll('[data-test="batch-row"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('郭栩甫')
    expect(wrapper.text()).toContain('另有 1 筆需人工處理')
    expect(wrapper.find('[data-test="batch-submit"]').text()).toContain('1')
  })

  it('送出的 items 為 payment_id 與 expected_digest', async () => {
    apiMocks.batchAllocateCollectionPayments.mockResolvedValue({
      results: [{ payment_id: 1, ok: true, receipt_id: 900,
                  allocated_total: 10800, error: null }],
      succeeded: 1, failed: 0,
    })
    const wrapper = await open()
    await wrapper.find('[data-test="batch-submit"]').trigger('click')
    await nextTick()
    expect(apiMocks.batchAllocateCollectionPayments).toHaveBeenCalledWith({
      items: [{ payment_id: 1, expected_digest: 'a3f9c1d84b2e0577' }],
    })
  })

  it('結果態逐筆顯示失敗原因', async () => {
    apiMocks.batchAllocateCollectionPayments.mockResolvedValue({
      results: [{ payment_id: 1, ok: false, receipt_id: null,
                  allocated_total: null, error: '候選已變更，請重新預覽' }],
      succeeded: 0, failed: 1,
    })
    const wrapper = await open()
    await wrapper.find('[data-test="batch-submit"]').trigger('click')
    await nextTick(); await nextTick()
    expect(wrapper.text()).toContain('候選已變更，請重新預覽')
    expect(wrapper.text()).toContain('郭栩甫')
  })

  it('truncated 時顯示另有 N 筆提示', async () => {
    const wrapper = await open(preview({ truncated: true }))
    expect(wrapper.find('[data-test="batch-truncated"]').exists()).toBe(true)
  })
})
