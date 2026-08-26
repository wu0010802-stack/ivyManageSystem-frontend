/**
 * SPEC-016 代收分配對話框：
 * - auto_high 唯一組合自動預填（會計只需按確認）
 * - 學生未繳項目「本期」徽章與一鍵加入
 * - 可用預繳候選（BE 回傳 students[].prepayment）可一鍵加入分配
 * - 分配以帳單面額（毛額）為基準，手續費僅顯示不進分配
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getCollectionCandidates: vi.fn(),
  allocateCollectionPayment: vi.fn(() => Promise.resolve({})),
}))
vi.mock('@/api/fees', () => apiMocks)
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

const STUBS = {
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-select': { template: '<select v-bind="$attrs"><slot /></select>' },
  'el-option': { template: '<option />' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-input-number': { template: '<input type="number" v-bind="$attrs" />' },
}

const PAYMENT = {
  id: 11,
  import_id: 1,
  customer_paid_date: '2026-08-03',
  channel: '統一',
  gross_amount: 10800,
  net_amount: 10798,
  fee_amount: 2,
  collection_suffix: '1104',
  bill_year: 2026,
  bill_month: 8,
  posting_date: '2026-08-10',
  expected_posting_date: '2026-08-10',
  occurrence_index: 0,
  reconciliation_status: 'imported',
  status_note: null,
  allocated_total: 0,
  unallocated: 10800,
}

function candidates(over: Record<string, unknown> = {}) {
  return {
    payment_id: 11,
    level: 'auto_high',
    bill_target_month: '2026-08',
    bill_period: '115-1',
    reasons: ['帳號錨定唯一且金額恰可完全組成'],
    candidates: [
      {
        cross_student: false,
        total: 10800,
        parts: [
          {
            part_type: 'fee_record',
            student_id: 5,
            amount: 10800,
            label: '月費（2026-08）',
            fee_record_id: 77,
            target_school_year: null,
            target_semester: null,
          },
        ],
      },
    ],
    students: [
      {
        student_id: 5,
        display_name: '王小明',
        items: [
          {
            fee_record_id: 77,
            label: '月費（2026-08）',
            remaining: 10800,
            fee_type: 'monthly',
            in_bill_period: true,
          },
          {
            fee_record_id: 60,
            label: '月費（2026-07）',
            remaining: 9720,
            fee_type: 'monthly',
            in_bill_period: false,
          },
        ],
        prepayment: { target_school_year: 115, target_semester: 2, amount: 5000 },
      },
    ],
    ...over,
  }
}

async function mountDialog(payment = PAYMENT) {
  const Dialog = (await import('../CollectionAllocationDialog.vue')).default
  const wrapper = mount(Dialog, {
    props: { visible: true, payment },
    global: { stubs: STUBS },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.getCollectionCandidates.mockResolvedValue(candidates())
})

describe('CollectionAllocationDialog', () => {
  it('顯示帳單期別與手續費說明（分配以毛額為準）', async () => {
    const wrapper = await mountDialog()
    expect(wrapper.find('[data-test="bill-period"]').text()).toContain('2026-08')
    expect(wrapper.find('[data-test="fee-note"]').text()).toContain('10,800')
  })

  it('auto_high 唯一組合自動預填分配明細', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as { parts: { fee_record_id?: number }[] }
    expect(vm.parts).toHaveLength(1)
    expect(vm.parts[0].fee_record_id).toBe(77)
  })

  it('needs_review 不自動預填', async () => {
    apiMocks.getCollectionCandidates.mockResolvedValue(
      candidates({ level: 'needs_review' }),
    )
    const wrapper = await mountDialog()
    const vm = wrapper.vm as unknown as { parts: unknown[] }
    expect(vm.parts).toHaveLength(0)
  })

  it('本期項目標示徽章', async () => {
    const wrapper = await mountDialog()
    expect(wrapper.find('[data-test="student-items"]').text()).toContain('本期')
  })

  it('可一鍵加入可用預繳候選（BE 已回傳 prepayment）', async () => {
    const wrapper = await mountDialog()
    const btn = wrapper.find('[data-test="add-prepayment"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    const vm = wrapper.vm as unknown as {
      parts: {
        part_type: string
        amount: number
        student_id?: number
        target_school_year?: number
        target_semester?: number
      }[]
    }
    const prepay = vm.parts.find((p) => p.part_type === 'prepayment')
    expect(prepay).toMatchObject({
      amount: 5000,
      student_id: 5,
      target_school_year: 115,
      target_semester: 2,
    })
  })

  it('學生無可用預繳時不顯示加入按鈕', async () => {
    const noPrepay = candidates()
    noPrepay.students[0].prepayment = null as never
    apiMocks.getCollectionCandidates.mockResolvedValue(noPrepay)
    const wrapper = await mountDialog()
    expect(wrapper.find('[data-test="add-prepayment"]').exists()).toBe(false)
  })
})
