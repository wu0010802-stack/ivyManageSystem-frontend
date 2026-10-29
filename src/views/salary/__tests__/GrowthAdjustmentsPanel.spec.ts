import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import GrowthAdjustmentsPanel from '../components/GrowthAdjustmentsPanel.vue'

// 月額覆寫／扣抵載入失敗不能退回「本學年無…」：行政會以為沒設過而重複新增，
// 已發放員工的異動要先講清楚「已發金額不會變」。

const mocks = vi.hoisted(() => ({
  listGrowthPositionRates: vi.fn(),
  listGrowthRateSegments: vi.fn(),
  createGrowthRateSegment: vi.fn(),
  deleteGrowthRateSegment: vi.fn(),
  listGrowthDeductions: vi.fn(),
  createGrowthDeduction: vi.fn(),
  deleteGrowthDeduction: vi.fn(),
}))
vi.mock('@/api/growthContract', () => ({
  listGrowthPositionRates: (...a: unknown[]) => mocks.listGrowthPositionRates(...a),
  listGrowthRateSegments: (...a: unknown[]) => mocks.listGrowthRateSegments(...a),
  createGrowthRateSegment: (...a: unknown[]) => mocks.createGrowthRateSegment(...a),
  deleteGrowthRateSegment: (...a: unknown[]) => mocks.deleteGrowthRateSegment(...a),
  listGrowthDeductions: (...a: unknown[]) => mocks.listGrowthDeductions(...a),
  createGrowthDeduction: (...a: unknown[]) => mocks.createGrowthDeduction(...a),
  deleteGrowthDeduction: (...a: unknown[]) => mocks.deleteGrowthDeduction(...a),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

const STUBS = {
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { props: ['label'], template: '<div class="pane"><slot /></div>' },
  'el-table': { props: ['data'], template: '<div class="table-stub">{{ JSON.stringify(data) }}</div>' },
  'el-table-column': true,
  'el-button': {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': true,
  'el-select': true,
  'el-option': true,
  'el-date-picker': true,
  'el-input': true,
  'el-input-number': true,
  'el-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>',
  },
}

const failure = () => Object.assign(new Error('boom'), { response: { status: 500, data: {} } })

const segment = {
  id: 1,
  employee_id: 2,
  employee_name: '林慧慈',
  school_year: 115,
  start_month: '2026-10',
  end_month: '2027-01',
  position_key: 'head_teacher_a',
  monthly_rate: 620,
  note: null,
}
const deduction = { id: 5, employee_id: 2, employee_name: '林慧慈', school_year: 115, amount: 1000, reason: '警告款', source: 'manual' }

interface PanelVm {
  segmentsError: boolean
  deductionsError: boolean
  positionRatesError: boolean
  deductionForm: { employee_id: number | null; school_year: number; amount: number | null; reason: string }
  openDeductionDialog: () => void
  submitDeduction: () => Promise<void>
  confirmDeleteSegment: (row: typeof segment) => Promise<void>
  confirmDeleteDeduction: (row: typeof deduction) => Promise<void>
}

const mountPanel = (props: Record<string, unknown> = {}) =>
  mount(GrowthAdjustmentsPanel, {
    props: { schoolYear: 115, canWrite: true, employeeOptions: [{ id: 2, name: '林慧慈' }], ...props },
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })

beforeEach(() => {
  mocks.listGrowthPositionRates.mockReset().mockResolvedValue({ data: [] })
  mocks.listGrowthRateSegments.mockReset().mockResolvedValue({ data: { items: [] } })
  mocks.listGrowthDeductions.mockReset().mockResolvedValue({ data: { items: [] } })
  mocks.createGrowthRateSegment.mockReset()
  mocks.deleteGrowthRateSegment.mockReset().mockResolvedValue({ data: {} })
  mocks.createGrowthDeduction.mockReset().mockResolvedValue({ data: deduction })
  mocks.deleteGrowthDeduction.mockReset().mockResolvedValue({ data: {} })
  vi.mocked(ElMessage.error).mockReset()
  vi.mocked(ElMessageBox.confirm).mockReset()
})

describe('GrowthAdjustmentsPanel 載入失敗', () => {
  it('月額覆寫載入失敗：顯示錯誤態，不說「本學年無月額覆寫」；重試成功後顯示列表', async () => {
    mocks.listGrowthRateSegments.mockRejectedValueOnce(failure())
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.segmentsError).toBe(true)
    expect(wrapper.text()).toContain('月額覆寫載入失敗')
    expect(wrapper.findAll('.empty-state__title').map((t) => t.text())).not.toContain('本學年無月額覆寫')

    mocks.listGrowthRateSegments.mockResolvedValueOnce({ data: { items: [segment] } })
    await wrapper.findAll('[data-test="load-error-retry"]')[0].trigger('click')
    await flushPromises()
    expect(vm.segmentsError).toBe(false)
    expect(wrapper.text()).toContain('林慧慈')
  })

  it('扣抵載入失敗：顯示錯誤態，不說「本學年無扣抵」', async () => {
    mocks.listGrowthDeductions.mockRejectedValueOnce(failure())
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.deductionsError).toBe(true)
    expect(wrapper.text()).toContain('扣抵載入失敗')
    expect(wrapper.findAll('.empty-state__title').map((t) => t.text())).not.toContain('本學年無扣抵')
  })

  it('職務月額表載入失敗：記錄失敗狀態並提示（新增覆寫時無法選職務）', async () => {
    mocks.listGrowthPositionRates.mockRejectedValueOnce(failure())
    const wrapper = mountPanel()
    await flushPromises()
    expect((wrapper.vm as unknown as PanelVm).positionRatesError).toBe(true)
    expect(ElMessage.error).toHaveBeenCalled()
  })
})

describe('GrowthAdjustmentsPanel 已發放員工的異動要先確認', () => {
  it('對已發放員工新增扣抵：先確認；取消就不送', async () => {
    const wrapper = mountPanel({ paidEmployeeIds: [2] })
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openDeductionDialog()
    vm.deductionForm.employee_id = 2
    vm.deductionForm.amount = 1000
    vm.deductionForm.reason = '警告款'

    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    await vm.submitDeduction()
    expect(mocks.createGrowthDeduction).not.toHaveBeenCalled()

    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    await vm.submitDeduction()
    await flushPromises()
    expect(mocks.createGrowthDeduction).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(ElMessageBox.confirm).mock.calls.at(-1) ?? []
    expect(String(message)).toContain('已發放')
    expect(String(message)).toContain('不會自動追扣')
  })

  it('對尚未發放的員工新增扣抵：沒有額外確認', async () => {
    const wrapper = mountPanel({ paidEmployeeIds: [3] })
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openDeductionDialog()
    vm.deductionForm.employee_id = 2
    vm.deductionForm.amount = 1000
    vm.deductionForm.reason = '警告款'

    await vm.submitDeduction()
    await flushPromises()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(mocks.createGrowthDeduction).toHaveBeenCalledTimes(1)
  })

  it('刪除已發放員工的扣抵／覆寫：確認文案帶提醒', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const wrapper = mountPanel({ paidEmployeeIds: [2] })
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm

    await vm.confirmDeleteDeduction(deduction)
    await vm.confirmDeleteSegment(segment)

    const [first] = vi.mocked(ElMessageBox.confirm).mock.calls[0]
    const [second] = vi.mocked(ElMessageBox.confirm).mock.calls[1]
    expect(String(first)).toContain('已發放')
    expect(String(second)).toContain('已發放')
  })

  it('刪除未發放員工的扣抵：確認文案不帶發放提醒', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const wrapper = mountPanel({ paidEmployeeIds: [] })
    await flushPromises()
    await (wrapper.vm as unknown as PanelVm).confirmDeleteDeduction(deduction)

    const [message] = vi.mocked(ElMessageBox.confirm).mock.calls[0]
    expect(String(message)).not.toContain('已發放')
  })
})
