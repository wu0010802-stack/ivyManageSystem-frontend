import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BatchAdjustDialog from '../BatchAdjustDialog.vue'

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }
})

const STUBS = {
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': true,
  'el-option': true,
  'el-input-number': true,
  'el-input': true,
  'el-button': { template: '<button><slot /></button>' },
  teleport: true,
}
const mountDialog = () => mount(BatchAdjustDialog, { props: { modelValue: true, count: 3 }, global: { stubs: STUBS } })

describe('BatchAdjustDialog', () => {
  it('原因 < 5 字擋下不 emit confirm', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { field: string; value: number; reason: string; submit: () => void }
    vm.field = 'festival_bonus'; vm.value = 500; vm.reason = '太短'
    vm.submit()
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('填妥 emit confirm 帶 {field,value,reason}', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { field: string; value: number; reason: string; submit: () => void }
    vm.field = 'festival_bonus'; vm.value = 500; vm.reason = '活動加班補發'
    vm.submit()
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({ field: 'festival_bonus', value: 500, reason: '活動加班補發' })
  })
})
