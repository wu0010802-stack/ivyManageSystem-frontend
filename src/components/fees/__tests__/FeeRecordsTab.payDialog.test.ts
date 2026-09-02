/**
 * 付款 dialog：狀態化標題、期別/累計脈絡、累計語意與差額呈現。
 *
 * 鐵律：`payFeeRecord` 的 `amount_paid` 是「更新後累計已繳」，UI 重構只能改呈現，
 * 不得把 payload 改成「本次收款」。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const getFeeRecords = vi.fn()
const getFeeSummary = vi.fn()
const payFeeRecord = vi.fn()
vi.mock('@/api/fees', () => ({
  getFeeRecords: (...args: unknown[]) => getFeeRecords(...args),
  getFeeSummary: (...args: unknown[]) => getFeeSummary(...args),
  payFeeRecord: (...args: unknown[]) => payFeeRecord(...args),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'

const ElFormStub = defineComponent({
  setup(_, { slots, expose }) {
    expose({ validate: () => Promise.resolve(true) })
    return () => h('form', {}, slots.default?.())
  },
})

const PARTIAL_ROW = {
  id: 7,
  student_name: '測試生',
  classroom_name: '測試班',
  fee_item_name: '測試費項',
  period: '114-2',
  amount_due: 1000,
  amount_paid: 500,
  status: 'partial',
}

const UNPAID_ROW = { ...PARTIAL_ROW, id: 8, amount_paid: 0, status: 'unpaid' }

interface TabVm {
  openPayDialog: (row: typeof PARTIAL_ROW) => void
  submitPay: () => Promise<void>
  payForm: { payment_date: string; amount_paid: number; payment_method: string; notes: string }
}

const mountTab = () =>
  shallowMount(FeeRecordsTab, {
    props: { classrooms: [], periodOptions: [] },
    global: {
      stubs: {
        teleport: true,
        'el-table-column': { template: '<span />' },
        'el-form': ElFormStub,
      },
    },
  })

const vmOf = (w: ReturnType<typeof mountTab>) => w.vm as unknown as TabVm

beforeEach(() => {
  vi.clearAllMocks()
  getFeeRecords.mockResolvedValue({ items: [], total: 0 })
  getFeeSummary.mockResolvedValue({})
  payFeeRecord.mockResolvedValue({})
})

describe('付款 dialog 標題與脈絡', () => {
  it('未繳 → 標題「收款」；部分繳費 → 「更新收款」', async () => {
    const w = mountTab()
    const vm = vmOf(w)

    vm.openPayDialog(UNPAID_ROW)
    await nextTick()
    expect(w.find('el-dialog').attributes('title')).toBe('收款')

    vm.openPayDialog(PARTIAL_ROW)
    await nextTick()
    expect(w.find('el-dialog').attributes('title')).toBe('更新收款')
  })

  it('頂部脈絡含學生、班級、期別、費用項目、應繳與目前已繳', async () => {
    const w = mountTab()
    vmOf(w).openPayDialog(PARTIAL_ROW)
    await nextTick()
    const ctx = w.find('[data-test="pay-context"]')
    expect(ctx.exists()).toBe(true)
    const text = ctx.text()
    expect(text).toContain('測試生')
    expect(text).toContain('測試班')
    expect(text).toContain('114-2')
    expect(text).toContain('測試費項')
    expect(text).toContain('1,000')
    expect(text).toContain('500')
  })
})

describe('付款 dialog 累計語意與差額', () => {
  it('欄位使用「入帳後累計已繳」語意並即時顯示 目前累計 → 更新後累計 → 差額/尚欠', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    vm.openPayDialog(PARTIAL_ROW)
    await nextTick()

    // label 是 el-form-item 的 prop（未註冊元素時呈現為屬性）→ 斷言 html
    expect(w.html()).toContain('入帳後累計已繳')

    vm.payForm.amount_paid = 800
    await nextTick()
    const calc = w.find('[data-test="pay-calc"]')
    expect(calc.exists()).toBe(true)
    const text = calc.text()
    expect(text).toContain('500') // 目前累計
    expect(text).toContain('800') // 更新後累計
    expect(text).toContain('300') // 本次差額
    expect(text).toContain('200') // 更新後尚欠
  })

  it('更新後累計低於目前累計 → 顯示更正 warning，但不擋送出', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    vm.openPayDialog(PARTIAL_ROW)
    await nextTick()

    vm.payForm.amount_paid = 300
    await nextTick()
    expect(w.find('[data-test="pay-correction-warning"]').exists()).toBe(true)

    await vm.submitPay()
    await flushPromises()
    expect(payFeeRecord).toHaveBeenCalledTimes(1)
  })

  it('送出的 payload 仍是累計 amount_paid（原 API 契約不變）', async () => {
    const w = mountTab()
    const vm = vmOf(w)
    vm.openPayDialog(PARTIAL_ROW)
    await nextTick()

    vm.payForm.amount_paid = 800
    vm.payForm.payment_date = '2026-08-17'
    await vm.submitPay()
    await flushPromises()

    expect(payFeeRecord).toHaveBeenCalledTimes(1)
    const [id, payload] = payFeeRecord.mock.calls[0] as [number, Record<string, unknown>]
    expect(id).toBe(7)
    expect(payload.amount_paid).toBe(800)
    expect(payload.payment_date).toBe('2026-08-17')
    expect(payload).toHaveProperty('payment_method')
    expect(payload).toHaveProperty('notes')
    expect(payload).not.toHaveProperty('delta')
    expect(payload).not.toHaveProperty('payment_amount')
  })
})
