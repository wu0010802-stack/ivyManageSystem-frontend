import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import BatchAdjustDialog from '../BatchAdjustDialog.vue'
import type { SettlementRecord } from '@/composables/useSalarySettlement'

// FormDialog 殼層換成直出 slot；el-form 的 validate 在 vitest 恆 true（見記憶），
// 送出條件改看 canSubmit 與 emit 內容。
const FormDialogStub = defineComponent({
  props: ['modelValue', 'title', 'submitText', 'disabled'],
  emits: ['submit', 'update:modelValue'],
  setup(_props, { slots }) {
    return () => h('div', { class: 'form-dialog-stub' }, slots.default?.())
  },
})

const STUBS = {
  FormDialog: FormDialogStub,
  'el-form': defineComponent({
    setup(_p, { slots, expose }) {
      expose({ validate: () => Promise.resolve(true) })
      return () => h('form', slots.default?.())
    },
  }),
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': true,
  'el-option': true,
  'el-radio-group': true,
  'el-radio-button': true,
  'el-input-number': true,
  'el-input': true,
  'el-alert': { props: ['title'], template: '<div class="alert">{{ title }}<slot /></div>' },
  'el-table': true,
  'el-table-column': true,
  teleport: true,
}

const rec = (over: Partial<SettlementRecord>): SettlementRecord => ({
  id: 1,
  employee_id: 1,
  employee_name: '甲',
  version: 3,
  gross_salary: 30000,
  net_salary: 28000,
  base_transfer_amount: 28000,
  is_finalized: false,
  breakdown_stale: false,
  manual_overrides: [],
  ...over,
})

interface Vm {
  form: { field: string; mode: 'set' | 'add' | 'sub'; amount: number; reason: string }
  preview: { id: number; current: number; next: number; invalid: boolean; netAffected: boolean; netBefore: number; netAfter: number }[]
  canSubmit: boolean
  submit: () => Promise<void>
}

const mountDialog = (rows: SettlementRecord[], failures: { id: number; name: string; reason: string }[] = []) =>
  mount(BatchAdjustDialog, { props: { modelValue: true, rows, failures }, global: { stubs: STUBS } })

describe('BatchAdjustDialog 預覽', () => {
  const rows = [
    rec({ id: 1, employee_name: '甲', meeting_overtime_pay: 416, late_deduction: 0 }),
    rec({ id: 2, employee_name: '乙', meeting_overtime_pay: 0, late_deduction: 80, version: 5 }),
  ]

  it('加：每人以現值加上金額；加項影響實領同向', async () => {
    const w = mountDialog(rows)
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'meeting_overtime_pay', mode: 'add', amount: 500 })
    await w.vm.$nextTick()
    expect(vm.preview.map((p) => [p.current, p.next])).toEqual([[416, 916], [0, 500]])
    expect(vm.preview[0].netAfter - vm.preview[0].netBefore).toBe(500)
  })

  it('扣項：調高扣款 → 實領反向減少', async () => {
    const w = mountDialog(rows)
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'late_deduction', mode: 'set', amount: 100 })
    await w.vm.$nextTick()
    expect(vm.preview[1].netAfter - vm.preview[1].netBefore).toBe(-20)
  })

  it('節慶獎金（獨立轉帳）主薪轉照原金額，但提醒補充保費可能變動', async () => {
    const w = mountDialog(rows)
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'festival_bonus', mode: 'set', amount: 3000 })
    await w.vm.$nextTick()
    expect(vm.preview.every((p) => !p.netAffected)).toBe(true)
    expect(w.text()).toContain('二代健保補充保費')
    expect(w.text()).not.toContain('不影響實領')
  })

  it('主管紅利（加項）也提醒補充保費；節慶獎金扣減不提醒', async () => {
    const w = mountDialog(rows)
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'supervisor_dividend', mode: 'set', amount: 3000 })
    await w.vm.$nextTick()
    expect(w.text()).toContain('二代健保補充保費')
    Object.assign(vm.form, { field: 'meeting_absence_deduction' })
    await w.vm.$nextTick()
    expect(w.text()).not.toContain('二代健保補充保費')
  })

  it('扣款調高到實領 < 0 → 擋下（後端也會拒絕）', async () => {
    const w = mountDialog([rec({ id: 9, net_salary: 500, base_transfer_amount: 500, absence_deduction: 0 })])
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'absence_deduction', mode: 'set', amount: 800, reason: '補扣曠職三天' })
    await w.vm.$nextTick()
    expect(vm.canSubmit).toBe(false)
    expect(w.text()).toContain('1 人調整後實領會小於 0')
  })

  it('減到負數 → 標出且不可送出', async () => {
    const w = mountDialog(rows)
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'meeting_overtime_pay', mode: 'sub', amount: 500, reason: '扣回重複發放' })
    await w.vm.$nextTick()
    expect(vm.preview.map((p) => p.invalid)).toEqual([true, true])
    expect(vm.canSubmit).toBe(false)
    expect(w.text()).toContain('2 人調整後會變成負數')
  })

  it('原因不足 5 字 → 不可送出', async () => {
    const w = mountDialog(rows)
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'meeting_overtime_pay', mode: 'set', amount: 500, reason: '補發' })
    await w.vm.$nextTick()
    expect(vm.canSubmit).toBe(false)
  })

  it('送出：每人帶自己的版本與換算後的絕對值', async () => {
    const w = mountDialog(rows)
    const vm = w.vm as unknown as Vm
    Object.assign(vm.form, { field: 'meeting_overtime_pay', mode: 'add', amount: 500, reason: '10/30 臨時會議補發' })
    await w.vm.$nextTick()
    await vm.submit()
    expect(w.emitted('confirm')?.[0]?.[0]).toEqual({
      field: 'meeting_overtime_pay',
      reason: '10/30 臨時會議補發',
      items: [
        { id: 1, version: 3, value: 916 },
        { id: 2, version: 5, value: 500 },
      ],
    })
  })

  it('上次失敗的人列在最上方', () => {
    const w = mountDialog([rows[1]], [{ id: 2, name: '乙', reason: '這筆剛被其他人改過' }])
    expect(w.text()).toContain('上次有 1 人沒有套用成功')
    expect(w.text()).toContain('乙：這筆剛被其他人改過')
  })
})
