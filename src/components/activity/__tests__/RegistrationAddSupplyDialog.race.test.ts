import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// review P3（2026-07-12）：loadSupplies 無請求序號守衛。[schoolYear, semester] watch 會清空
// supplies 快取，但在途的舊學期載入可在清空後 resolve、把舊學期用品塞回；接著 length>0 的
// 快取短路使新學期永不重載 → 對話框顯示錯學期用品（寫入雖被後端學期守衛退回，UX 仍錯）。
// 修正：loadSupplies 加 supplyLoadSeq，過期回應丟棄；學期 watch 同步 ++seq 使在途載入失效。

const getSuppliesMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({
  addRegistrationSupply: vi.fn(),
  getSupplies: getSuppliesMock,
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import RegistrationAddSupplyDialog from '../RegistrationAddSupplyDialog.vue'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const STUBS = {
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button><slot /></button>' },
}

function mountDialog(props: Record<string, unknown>) {
  return mount(RegistrationAddSupplyDialog, {
    props: { modelValue: false, schoolYear: 114, semester: 1, registrationId: 7, ...props },
    global: { stubs: STUBS },
  })
}

describe('RegistrationAddSupplyDialog loadSupplies 請求序號守衛（review P3）', () => {
  beforeEach(() => getSuppliesMock.mockReset())

  it('切學期後舊學期用品載入不覆寫新學期清單', async () => {
    const d1 = deferred<unknown>() // 學期1 用品
    const d2 = deferred<unknown>() // 學期2 用品
    getSuppliesMock.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

    const wrapper = mountDialog({})
    await wrapper.setProps({ modelValue: true }) // 載入 #1（學期1，d1 pending）
    await flushPromises()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ semester: 2 }) // watch 清空 supplies
    await wrapper.setProps({ modelValue: true }) // 載入 #2（學期2，d2 pending）
    await flushPromises()

    d2.resolve({ data: { supplies: [{ id: 20, name: '學期2用品', price: 50 }] } })
    await flushPromises()
    d1.resolve({ data: { supplies: [{ id: 10, name: '學期1用品', price: 30 }] } }) // 遲到
    await flushPromises()

    const ss = wrapper.vm.$.setupState as { supplies: { id: number }[] }
    expect(ss.supplies.length).toBe(1)
    expect(ss.supplies[0].id).toBe(20) // 學期2 用品，非學期1 的 10
    wrapper.unmount()
  })
})
