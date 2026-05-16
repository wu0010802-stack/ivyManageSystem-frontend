import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// ─── Mock 權限：READ + WRITE 都給（單獨案例覆寫） ─────────────────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

// ─── Mock fees API ─────────────────────────────────────────────────────────────
const mockGetFeeRecords = vi.fn()
const mockGetFeeAdjustments = vi.fn()
const mockGetFeePeriods = vi.fn()
const mockPayFeeRecord = vi.fn()

vi.mock('@/api/fees', () => ({
  getFeeRecords: (...args) => mockGetFeeRecords(...args),
  getFeeAdjustments: (...args) => mockGetFeeAdjustments(...args),
  getFeePeriods: (...args) => mockGetFeePeriods(...args),
  payFeeRecord: (...args) => mockPayFeeRecord(...args),
  // 給子元件用，未實際呼叫
  createFeeAdjustment: vi.fn(),
  updateFeeAdjustment: vi.fn(),
  deleteFeeAdjustment: vi.fn(),
  suggestRefund: vi.fn(),
  getFeeRefunds: vi.fn().mockResolvedValue({ items: [] }),
  refundFeeRecord: vi.fn(),
}))

// ─── 工具 ──────────────────────────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/utils/format', () => ({
  todayISO: () => '2026-05-16',
}))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 114, semester: 2 }),
}))
vi.mock('@/utils/error', () => ({
  apiError: (e, fallback) => e?.response?.data?.detail || fallback || '錯誤',
}))

// 子元件 stub（不參與單元測試）
vi.mock('@/components/fees/RefundSuggestModal.vue', () => ({
  default: { name: 'RefundSuggestModal', template: '<div />' },
}))
vi.mock('@/components/fees/AdjustmentEditDialog.vue', () => ({
  default: { name: 'AdjustmentEditDialog', template: '<div />' },
}))

import FeesTab from '@/components/student/tabs/FeesTab.vue'

// 與 FeeRecordsTab.spec 同款 stub：el-table 渲染 slot 不傳 row、
// el-table-column 完全 stub 掉，內容驗證走 vm 暴露的 state。
const GLOBAL_STUBS = {
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-input': { template: '<input />' },
  'el-input-number': { props: ['modelValue'], template: '<input />' },
  'el-select': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-date-picker': { template: '<input />' },
  'el-empty': { props: ['description'], template: '<div class="el-empty">{{ description }}<slot /></div>' },
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function makeRecord(overrides = {}) {
  return {
    id: 1,
    student_id: 42,
    period: '114-2',
    fee_type: 'registration',
    fee_item_name: '註冊費',
    amount_due: 5000,
    amount_paid: 0,
    status: 'unpaid',
    payment_method: null,
    payment_date: null,
    notes: '',
    ...overrides,
  }
}

function makeAdjustment(overrides = {}) {
  return {
    id: 10,
    student_id: 42,
    period: '114-2',
    adjustment_type: 'sibling_discount',
    amount: 500,
    reason: '兄姊就讀',
    notes: '',
    ...overrides,
  }
}

async function mountTab(props = {}) {
  const w = mount(FeesTab, {
    props: { studentId: 42, studentName: '王小明', active: true, ...props },
    global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
  })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFeePeriods.mockResolvedValue(['114-2', '114-1'])
  mockGetFeeRecords.mockResolvedValue({ items: [] })
  mockGetFeeAdjustments.mockResolvedValue({ items: [] })
})

describe('FeesTab — 對齊學費管理功能', () => {
  it('掛載時載入 records 與 adjustments，並帶 student_id 與本學期 period', async () => {
    await mountTab()
    expect(mockGetFeeRecords).toHaveBeenCalled()
    const recArgs = mockGetFeeRecords.mock.calls[0][0]
    expect(recArgs.student_id).toBe(42)
    // 因 loadPeriods 先 await，第一次 fetchData 必已切到本學期 114-2
    expect(recArgs.period).toBe('114-2')
    expect(mockGetFeeAdjustments).toHaveBeenCalled()
    const adjArgs = mockGetFeeAdjustments.mock.calls[0][0]
    expect(adjArgs.student_id).toBe(42)
    expect(adjArgs.period).toBe('114-2')
    // 不應 race 出第二次請求
    expect(mockGetFeeRecords).toHaveBeenCalledTimes(1)
  })

  it('未取得 FEES_READ 權限時顯示 Empty 訊息，不發 API', async () => {
    const auth = await import('@/utils/auth')
    auth.hasPermission.mockReturnValue(false)
    const w = mount(FeesTab, {
      props: { studentId: 42, active: true },
      global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
    })
    await flushPromises()
    expect(mockGetFeeRecords).not.toHaveBeenCalled()
    expect(w.text()).toContain('沒有檢視學費的權限')
    auth.hasPermission.mockReturnValue(true) // 還原供其他 case
  })

  it('totals 正確：淨應收 = 原應收 - 折抵；未收 = 淨應收 - 已收', async () => {
    mockGetFeeRecords.mockResolvedValueOnce({
      items: [
        makeRecord({ id: 1, fee_type: 'registration', amount_due: 5000, amount_paid: 5000, status: 'paid' }),
        makeRecord({ id: 2, fee_type: 'monthly', amount_due: 24000, amount_paid: 10000, status: 'partial' }),
      ],
    })
    mockGetFeeAdjustments.mockResolvedValueOnce({
      items: [makeAdjustment({ id: 10, adjustment_type: 'sibling_discount', amount: 500 })],
    })
    const w = await mountTab()
    const totals = w.vm.totals
    expect(totals.due).toBe(29000)
    expect(totals.adjTotal).toBe(500)
    expect(totals.netDue).toBe(28500)
    expect(totals.paid).toBe(15000)
    expect(totals.unpaid).toBe(13500)
  })

  it('學期下拉切換會觸發重新載入並帶 period 參數', async () => {
    const w = await mountTab()
    mockGetFeeRecords.mockClear()
    mockGetFeeAdjustments.mockClear()

    const select = w.find('select')
    await select.setValue('114-1')
    await flushPromises()

    expect(mockGetFeeRecords).toHaveBeenCalled()
    const args = mockGetFeeRecords.mock.calls[0][0]
    expect(args.period).toBe('114-1')
    expect(args.student_id).toBe(42)
    const adjArgs = mockGetFeeAdjustments.mock.calls[0][0]
    expect(adjArgs.period).toBe('114-1')
  })

  it('FEE_TYPES 11 類完整渲染（8 應收 + 3 折抵）', async () => {
    const w = await mountTab()
    expect(w.vm.recordRows.length).toBe(8)
    expect(w.vm.adjustmentRows.length).toBe(3)
    const recordLabels = w.vm.recordRows.map((r) => r.label)
    expect(recordLabels).toEqual(
      expect.arrayContaining(['註冊費', '雜費', '月費', '交通費', '夏制', '夏運', '代購品', '保險費']),
    )
    const adjLabels = w.vm.adjustmentRows.map((r) => r.label)
    expect(adjLabels).toEqual(expect.arrayContaining(['同胞優惠', '預繳', '其他/請假']))
  })

  it('暴露 refresh 方法給父元件呼叫', async () => {
    const w = await mountTab()
    expect(typeof w.vm.refresh).toBe('function')
    mockGetFeeRecords.mockClear()
    await w.vm.refresh()
    expect(mockGetFeeRecords).toHaveBeenCalled()
  })
})
