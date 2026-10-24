// 義華 115.09 對帳 #37：保費追溯補收／退回明細（可負數，進扣款合計、不進應發）
import { expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdjustDrawer from '../AdjustDrawer.vue'

const adjust = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const warning = vi.hoisted(() => vi.fn())
vi.mock('@/api/salary', () => ({ manualAdjustSalary: adjust }))
vi.mock('element-plus', () => ({ ElMessage: { warning, success: vi.fn(), info: vi.fn() }, ElMessageBox: { alert: vi.fn() } }))

const controls = {
  'el-drawer': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-alert': { template: '<div />' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { props: ['label'], template: '<label :data-label="label"><slot /></label>' },
  'el-input-number': { props: ['modelValue'], emits: ['update:modelValue'], template: `<input type="number" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))" />` },
  'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` },
  'el-checkbox': { props: ['modelValue'], template: '<input type="checkbox" />' },
  'el-button': { emits: ['click'], template: `<button @click="$emit('click')"><slot /></button>` },
}

beforeEach(() => { adjust.mockClear(); warning.mockClear() })

function mountRow(row: Record<string, unknown>) {
  return mount(AdjustDrawer, { props: { modelValue: true, row: { id: 8, version: 4, ...row } as never }, global: { stubs: controls } })
}
type State = { insItems: { label: string; amount: number }[]; reason: string; addInsItem: () => void; save: () => Promise<void> }
const stateOf = (w: ReturnType<typeof mountRow>) => w.vm.$.setupState as unknown as State

it('張啓觀：退回 8 月健保 -592（大於當月保費 0）可送出負數明細', async () => {
  const w = mountRow({ health_insurance: 0 })
  const s = stateOf(w)
  s.addInsItem()
  s.insItems[0].label = '退回8月健保'
  s.insItems[0].amount = -592
  s.reason = '改在區公所投保退回'
  await s.save()
  await flushPromises()
  expect(adjust).toHaveBeenCalledWith(
    8,
    { adjustment_reason: '改在區公所投保退回', insurance_adjustment_items: [{ label: '退回8月健保', amount: -592 }] },
    4,
  )
  w.unmount()
})

it('帶入既有明細，未修改時不送 insurance_adjustment_items', async () => {
  const w = mountRow({ insurance_adjustment_items: [{ label: '7-8月眷屬健保', amount: 1032 }], other_deduction: 0 })
  const s = stateOf(w)
  expect(s.insItems).toEqual([{ label: '7-8月眷屬健保', amount: 1032 }])
  s.reason = '只改其他欄位測試'
  await s.save()
  expect(adjust).not.toHaveBeenCalled()
  w.unmount()
})

it('名目空白或金額為 0 時擋下不送', async () => {
  const w = mountRow({})
  const s = stateOf(w)
  s.addInsItem()
  s.insItems[0].label = '退回8月勞保'
  s.insItems[0].amount = 0
  s.reason = '退回勞保差額測試'
  await s.save()
  expect(adjust).not.toHaveBeenCalled()
  expect(warning).toHaveBeenCalled()
  w.unmount()
})

it('刪光既有明細送空陣列（清空）', async () => {
  const w = mountRow({ insurance_adjustment_items: [{ label: '誤登', amount: 100 }] })
  const s = stateOf(w)
  s.insItems.splice(0, 1)
  s.reason = '清除誤登明細'
  await s.save()
  expect(adjust).toHaveBeenCalledWith(8, { adjustment_reason: '清除誤登明細', insurance_adjustment_items: [] }, 4)
  w.unmount()
})
