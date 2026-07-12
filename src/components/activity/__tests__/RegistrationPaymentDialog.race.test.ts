import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import RegistrationPaymentDialog from '../RegistrationPaymentDialog.vue'

// review P2#2（2026-07-12）：loadRefundSuggestion 的 stillCurrent() 只比對 modelValue 是否
// 開啟 + registrationId 是否相同，沒有請求序號。同一筆報名關閉後快速重開會發出兩次載入，
// 較慢的舊請求（可能是退費發生前的過時建議）最後 resolve 時 stillCurrent() 仍為 true →
// 覆寫較新請求的金額；舊請求的 finally 也會提前解除 refundSuggestionLoading 鎖。
// 修正：加 refundSuggestionSeq，stillCurrent 併驗序號、finally 僅最新請求解鎖。

const getRefundSuggestionMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({
  addRegistrationPayment: vi.fn(),
  getRefundSuggestion: getRefundSuggestionMock,
}))

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function mountDialog(props: Record<string, unknown>) {
  return mount(RegistrationPaymentDialog, {
    props: { modelValue: false, ...props },
    global: { stubs: { teleport: true } },
  })
}

describe('RegistrationPaymentDialog 退費建議請求序號守衛（review P2#2）', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    getRefundSuggestionMock.mockReset()
    warnSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({}) as never)
  })
  afterEach(() => warnSpy.mockRestore())

  it('同一筆關閉後重開：較慢的舊建議 resolve 後不覆寫新建議金額', async () => {
    const d1 = deferred<unknown>() // 第一次開啟（退費前，建議剩餘 800）
    const d2 = deferred<unknown>() // 重開（退費後，建議剩餘 300）
    getRefundSuggestionMock.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

    const wrapper = mountDialog({
      type: 'refund',
      registrationId: 42,
      totalAmount: 900,
      paidAmount: 900,
    })
    await wrapper.setProps({ modelValue: true }) // 載入 #1（d1 pending）
    await flushPromises()
    await wrapper.setProps({ modelValue: false }) // 關閉
    await wrapper.setProps({ modelValue: true }) // 重開 → 載入 #2（d2 pending，同 reg 42）
    await flushPromises()

    d2.resolve({ data: { remaining_suggested_amount: 300, items: [] } }) // 新
    await flushPromises()
    d1.resolve({ data: { remaining_suggested_amount: 800, items: [] } }) // 舊（遲到）
    await flushPromises()

    const vm = wrapper.vm as unknown as { form: { amount: number } }
    expect(vm.form.amount).toBe(300) // 非舊建議 800
    wrapper.unmount()
  })

  it('舊請求的 finally 不得提前解除載入鎖（最新請求仍在途時 loading 維持 true）', async () => {
    const d1 = deferred<unknown>()
    const d2 = deferred<unknown>()
    getRefundSuggestionMock.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

    const wrapper = mountDialog({
      type: 'refund',
      registrationId: 42,
      totalAmount: 900,
      paidAmount: 900,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    // 舊請求先 resolve → 其 finally 不可把 loading 關掉（#2 仍在途）
    d1.resolve({ data: { remaining_suggested_amount: 800, items: [] } })
    await flushPromises()

    const vm = wrapper.vm as unknown as { refundSuggestionLoading: boolean }
    expect(vm.refundSuggestionLoading).toBe(true)

    d2.resolve({ data: { remaining_suggested_amount: 300, items: [] } })
    await flushPromises()
    expect(vm.refundSuggestionLoading).toBe(false)
    wrapper.unmount()
  })
})
