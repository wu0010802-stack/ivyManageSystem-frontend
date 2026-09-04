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
  // 宣告 modelValue 為 prop（而非落進 $attrs），測試才能斷言 v-model 綁到哪個欄位
  'el-select': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs"><slot /></select>',
  },
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

  // SPEC-022 §4.2 起，預設候選（auto_high 且唯一）進的是確認卡而非手動編輯器，
  // 以下斷言手動編輯器 DOM 的既有測試改為先展開手動分配，行為（保留預填）不變。
  it('本期項目標示徽章', async () => {
    const wrapper = await mountDialog()
    await wrapper.find('[data-test="manual-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-test="student-items"]').text()).toContain('本期')
  })

  it('可一鍵加入可用預繳候選（BE 已回傳 prepayment）', async () => {
    const wrapper = await mountDialog()
    await wrapper.find('[data-test="manual-toggle"]').trigger('click')
    await nextTick()
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
    await wrapper.find('[data-test="manual-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-test="add-prepayment"]').exists()).toBe(false)
  })

  it('候選列顯示學生姓名而非 學生#id', async () => {
    const wrapper = await mountDialog()
    const text = wrapper.text()
    expect(text).toContain('王小明')
    expect(text).not.toContain('學生#5')
  })

  it('已自動套用的候選顯示已套用、不顯示可按的套用按鈕', async () => {
    const wrapper = await mountDialog()
    await wrapper.find('[data-test="manual-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-test="candidate-applied"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="use-candidate"]').exists()).toBe(false)
  })

  it('費用單以下拉選擇，送出帶正確 fee_record_id', async () => {
    const wrapper = await mountDialog()
    await wrapper.find('[data-test="manual-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-test="fee-record-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="fee-record-id-input"]').exists()).toBe(false)
    // v-model 必須綁在 fee_record_id 上：綁錯欄位（例如 student_id）時
    // payload 仍會是預填值而看不出來，只有查 modelValue 才抓得到
    expect(
      wrapper.findComponent('[data-test="fee-record-select"]').props('modelValue'),
    ).toBe(77)
    await wrapper.find('[data-test="alloc-confirm"]').trigger('click')
    await nextTick()
    expect(apiMocks.allocateCollectionPayment).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            part_type: 'fee_record',
            fee_record_id: 77,
            amount: 10800,
          }),
        ],
      }),
    )
  })

  it('unmatched（students 為空）時落回手動輸入單號', async () => {
    apiMocks.getCollectionCandidates.mockResolvedValue(
      candidates({
        level: 'unmatched',
        candidates: [],
        students: [],
        reasons: ['銷帳編號末四碼在繳費日期無有效學生配置'],
      }),
    )
    const wrapper = await mountDialog()
    await wrapper.find('[data-test="add-part"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-test="fee-record-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="fee-record-id-input"]').exists()).toBe(true)
  })

  // SPEC-022 §4.2：高信心（auto_high 且候選唯一）預設只給確認卡，
  // 不再讓會計看四段重複資訊；要改才展開完整編輯器，且保留預填 parts。
  it('高信心時只渲染確認卡，不渲染分配明細編輯器', async () => {
    const wrapper = await mountDialog()
    expect(wrapper.find('[data-test="alloc-confirm-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="part-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="manual-toggle"]').exists()).toBe(true)
  })

  it('高信心確認卡直接按確認即送出正確分配（不展開手動）', async () => {
    // 這是本功能的主線流程：會計開對話框→看確認卡→按確認，全程不展開編輯器。
    // 確認鈕必須留在 footer（v-if 之外），否則卡片態就沒有東西可按。
    const wrapper = await mountDialog()
    expect(wrapper.find('[data-test="alloc-confirm-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="part-row"]').exists()).toBe(false)
    await wrapper.find('[data-test="alloc-confirm"]').trigger('click')
    await nextTick()
    expect(apiMocks.allocateCollectionPayment).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            part_type: 'fee_record',
            fee_record_id: 77,
            amount: 10800,
          }),
        ],
        // 帳單面額全額吻合＝不可送出部分分配
        allow_partial: false,
      }),
    )
  })

  it('展開手動分配後出現編輯器且保留預填 parts', async () => {
    const wrapper = await mountDialog()
    await wrapper.find('[data-test="manual-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.findAll('[data-test="part-row"]')).toHaveLength(1)
  })

  it('非高信心直接進編輯器、不顯示確認卡', async () => {
    apiMocks.getCollectionCandidates.mockResolvedValue(
      candidates({
        level: 'needs_review',
        reasons: ['舊期別帳號繳款（帳單期別早於當期），請人工確認'],
      }),
    )
    const wrapper = await mountDialog()
    expect(wrapper.find('[data-test="alloc-confirm-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="manual-toggle"]').exists()).toBe(false)
  })
})
