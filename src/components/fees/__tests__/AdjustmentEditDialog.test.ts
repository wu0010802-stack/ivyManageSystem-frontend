import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/fees', () => ({
  createFeeAdjustment: vi.fn(),
  updateFeeAdjustment: vi.fn(),
  deleteFeeAdjustment: vi.fn(),
}))

import { createFeeAdjustment, updateFeeAdjustment, deleteFeeAdjustment } from '@/api/fees'
import AdjustmentEditDialog from '../AdjustmentEditDialog.vue'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

// 元件 defineExpose 出的測試介面（避免 as any）
interface DialogVm {
  list: Array<{ id: number; amount: number; adjustment_type: string }>
  showTypePicker: boolean
  newForm: { adjustment_type: string; amount: number; reason: string; notes: string }
  editForm: { amount: number; reason: string; notes: string }
  editingId: number | null
  startEdit: (item: { id: number; adjustment_type: string; amount: number; reason?: string | null }) => void
  saveEdit: (item: { id: number; adjustment_type: string; amount: number }) => Promise<void>
  addNew: () => Promise<void>
  removeItem: (item: { id: number; adjustment_type: string; amount: number }) => Promise<void>
}

function mountDialog(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(AdjustmentEditDialog, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      modelValue: true,
      student: { student_id: 5, student_name: '小明' },
      period: '114-2',
      adjustmentType: 'leave_deduction',
      existing: [],
      ...overrides,
    },
  })
  return wrapper
}

const vmOf = (w: ReturnType<typeof mountDialog>) => w.vm as unknown as DialogVm

describe('AdjustmentEditDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('種入 existing → 本地清單顯示正確筆數與金額', async () => {
    const wrapper = mountDialog({
      existing: [
        { id: 1, adjustment_type: 'leave_deduction', amount: 300, reason: '請假3天' },
        { id: 2, adjustment_type: 'other', amount: 50, reason: '雜項' },
      ],
    })
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.list.length).toBe(2)
    expect(vm.list[0].amount).toBe(300)
  })

  it('新增成功 → createFeeAdjustment 帶正確 payload + emit saved', async () => {
    asMock(createFeeAdjustment).mockResolvedValue({
      id: 9,
      adjustment_type: 'leave_deduction',
      amount: 200,
    })
    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.newForm.amount = 200
    vm.newForm.reason = '請假2天'
    await vm.addNew()
    await flushPromises()
    expect(createFeeAdjustment).toHaveBeenCalledWith({
      student_id: 5,
      period: '114-2',
      adjustment_type: 'leave_deduction',
      amount: 200,
      reason: '請假2天',
      notes: '',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(vm.list.length).toBe(1)
  })

  it('leave_deduction 欄 → showTypePicker=true；sibling_discount → false', async () => {
    const a = mountDialog({ adjustmentType: 'leave_deduction' })
    await flushPromises()
    expect(vmOf(a).showTypePicker).toBe(true)

    const b = mountDialog({ adjustmentType: 'sibling_discount' })
    await flushPromises()
    expect(vmOf(b).showTypePicker).toBe(false)
  })

  it('刪除 → 確認後呼叫 deleteFeeAdjustment + 從清單移除 + emit saved', async () => {
    // happy-dom 下 ElMessageBox.confirm 需 spy；resolve 代表使用者按確認
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    asMock(deleteFeeAdjustment).mockResolvedValue({ deleted: 1 })
    const wrapper = mountDialog({
      existing: [{ id: 1, adjustment_type: 'leave_deduction', amount: 300 }],
    })
    await flushPromises()
    const vm = vmOf(wrapper)
    await vm.removeItem({ id: 1, adjustment_type: 'leave_deduction', amount: 300 })
    await flushPromises()
    expect(deleteFeeAdjustment).toHaveBeenCalledWith(1)
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(vm.list.length).toBe(0)
  })

  it('編輯成功 → updateFeeAdjustment 帶 {amount,reason,notes}（保留原 type）+ 覆蓋清單 + emit saved', async () => {
    asMock(updateFeeAdjustment).mockResolvedValue({
      id: 1,
      adjustment_type: 'leave_deduction',
      amount: 450,
      reason: '改為4.5天',
      notes: '備註',
    })
    const wrapper = mountDialog({
      existing: [{ id: 1, adjustment_type: 'leave_deduction', amount: 300, reason: '請假3天' }],
    })
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.startEdit({ id: 1, adjustment_type: 'leave_deduction', amount: 300, reason: '請假3天' })
    vm.editForm.amount = 450
    vm.editForm.reason = '改為4.5天'
    vm.editForm.notes = '備註'
    await vm.saveEdit({ id: 1, adjustment_type: 'leave_deduction', amount: 300 })
    await flushPromises()
    expect(updateFeeAdjustment).toHaveBeenCalledWith(1, {
      amount: 450,
      reason: '改為4.5天',
      notes: '備註',
    })
    expect(vm.list[0].amount).toBe(450)
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('刪除取消（confirm reject）→ 不呼叫 deleteFeeAdjustment、不 emit saved、清單不變', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const wrapper = mountDialog({
      existing: [{ id: 1, adjustment_type: 'leave_deduction', amount: 300 }],
    })
    await flushPromises()
    const vm = vmOf(wrapper)
    await vm.removeItem({ id: 1, adjustment_type: 'leave_deduction', amount: 300 })
    await flushPromises()
    expect(deleteFeeAdjustment).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeFalsy()
    expect(vm.list.length).toBe(1)
  })

  it('缺少學生資訊 → addNew 不呼叫 createFeeAdjustment', async () => {
    const wrapper = mountDialog({ student: null })
    await flushPromises()
    const vm = vmOf(wrapper)
    await vm.addNew()
    await flushPromises()
    expect(createFeeAdjustment).not.toHaveBeenCalled()
  })
})
