import { expect, it, vi } from 'vitest'
import { shallowMount, mount, flushPromises } from '@vue/test-utils'
import AdjustDrawer from '../AdjustDrawer.vue'
const adjust = vi.hoisted(() => vi.fn().mockResolvedValue({}))
vi.mock('@/api/salary', () => ({ manualAdjustSalary: adjust }))
vi.mock('element-plus', () => ({ ElMessage: { warning: vi.fn(), success: vi.fn(), info: vi.fn() }, ElMessageBox: { alert: vi.fn() } }))
it('只調節慶扣減時僅送變動欄位與原因，保留版本前置條件', async () => {
  const w = shallowMount(AdjustDrawer, { global: { stubs: ['el-drawer', 'el-alert', 'el-form', 'el-form-item', 'el-input-number', 'el-input', 'el-button'] }, props: { modelValue: true, row: { id: 8, version: 4, festival_bonus: 1000, meeting_absence_deduction: 0 } as never } })
  const state = w.vm.$.setupState as unknown as { form: Record<string, number>; reason: string; save: () => Promise<void> }
  state.form.meeting_absence_deduction = 200
  state.reason = '核准扣減修正原因'
  await state.save()
  expect(adjust).toHaveBeenCalledWith(8, { adjustment_reason: '核准扣減修正原因', meeting_absence_deduction: 200 }, 4)
  w.unmount()
})
it('沒有修改數值或名目時不送出API', async () => {
  adjust.mockClear()
  const w = shallowMount(AdjustDrawer, { global: { stubs: ['el-drawer', 'el-alert', 'el-form', 'el-form-item', 'el-input-number', 'el-input', 'el-button'] }, props: { modelValue: true, row: { id: 8, version: 4 } as never } })
  const state = w.vm.$.setupState as unknown as { reason: string; save: () => Promise<void> }
  state.reason = '核准扣減修正原因'
  await state.save()
  expect(adjust).not.toHaveBeenCalled()
  w.unmount()
})


const controls = {
  'el-drawer': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { props: ['label'], template: '<label :data-label="label"><slot /></label>' },
  'el-input-number': { props: ['modelValue'], emits: ['update:modelValue'], template: `<input type="number" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))" />` },
  'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` },
  'el-checkbox': { props: ['modelValue'], emits: ['update:modelValue'], template: `<label><input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" /><slot /></label>` },
  'el-button': { emits: ['click'], template: `<button @click="$emit('click')"><slot /></button>` },
}
function mountClamp(festival = 0) {
  adjust.mockClear()
  return mount(AdjustDrawer, { props: { modelValue: true, row: { id: 8, version: 4, festival_bonus: festival, meeting_absence_deduction: 1000 } as never }, global: { stubs: controls } })
}
async function setDeduction(w: ReturnType<typeof mountClamp>) {
  await w.find('[data-label="節慶獎金扣減"] input').setValue('500')
  await w.find('[data-label="調整原因"] input').setValue('核准扣減修正原因')
}
async function clickSave(w: ReturnType<typeof mountClamp>) {
  await w.findAll('button').find((b) => b.text() === '儲存')!.trigger('click')
  await flushPromises()
}
it('原節慶獎金為0且降低扣減時，未明確確認金額不得送出', async () => {
  const w = mountClamp(); await setDeduction(w); await clickSave(w)
  expect(adjust).not.toHaveBeenCalled()
  w.unmount()
})
it.each([0, 1000])('明確指定節慶獎金可以保持原值 %s，送出獨立覆寫值', async (festival) => {
  const w = mountClamp(festival); await setDeduction(w)
  await w.find('input[type="checkbox"]').setValue(true)
  await clickSave(w)
  expect(adjust).toHaveBeenCalledWith(8, { adjustment_reason: '核准扣減修正原因', meeting_absence_deduction: 500, festival_bonus: festival }, 4)
  w.unmount()
})
it('原節慶正值預設自動連動，不送未修改的節慶金額', async () => {
  const w = mountClamp(1000); await setDeduction(w); await clickSave(w)
  expect(adjust).toHaveBeenCalledWith(8, { adjustment_reason: '核准扣減修正原因', meeting_absence_deduction: 500 }, 4)
  w.unmount()
})
it('重新開啟或切換薪資列，明確指定選項都重設', async () => {
  const w = mountClamp()
  await w.find('input[type="checkbox"]').setValue(true)
  await w.setProps({ modelValue: false }); await w.setProps({ modelValue: true })
  expect((w.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
  await w.find('input[type="checkbox"]').setValue(true)
  await w.setProps({ row: { id: 9, version: 1, festival_bonus: 0, meeting_absence_deduction: 1000 } as never })
  expect((w.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
  w.unmount()
})
