/**
 * 現金收款會進當日交接批的提示（2026-09-01 起）。
 *
 * 帳單頁收現金自此會在同一交易建立對帳收據並掛入當日現金交接批，交接後
 * 該日不能再收（後端回 409）。會計必須在按下收款前就知道這筆錢會落到哪個
 * 交接批，否則交接時對不上帳只能事後追。轉帳／其他不建收據（走對帳工作區
 * 匯入銷帳），因此不顯示此提示。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const getFeeRecords = vi.fn()
const getFeeSummary = vi.fn()
const payFeeRecord = vi.fn()
const batchPayFeeRecords = vi.fn()
vi.mock('@/api/fees', () => ({
  getFeeRecords: (...args: unknown[]) => getFeeRecords(...args),
  getFeeSummary: (...args: unknown[]) => getFeeSummary(...args),
  payFeeRecord: (...args: unknown[]) => payFeeRecord(...args),
  batchPayFeeRecords: (...args: unknown[]) => batchPayFeeRecords(...args),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import BatchPayDialog from '@/components/fees/BatchPayDialog.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'

const HINT = '[data-test="cash-handover-hint"]'

const ElFormStub = defineComponent({
  setup(_, { slots, expose }) {
    expose({ validate: () => Promise.resolve(true) })
    return () => h('form', {}, slots.default?.())
  },
})

const UNPAID_ROW = {
  id: 11,
  student_name: '測試生',
  classroom_name: '測試班',
  fee_item_name: '月費',
  period: '115-1',
  amount_due: 10800,
  amount_paid: 0,
  status: 'unpaid',
}

interface TabVm {
  openPayDialog: (row: typeof UNPAID_ROW) => void
  payForm: { payment_method: string }
}

beforeEach(() => {
  vi.clearAllMocks()
  getFeeRecords.mockResolvedValue({ items: [], total: 0 })
  getFeeSummary.mockResolvedValue({})
})

describe('逐筆收款 dialog', () => {
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

  it('預設現金時顯示「計入今日現金交接批」提示', async () => {
    const w = mountTab()
    ;(w.vm as unknown as TabVm).openPayDialog(UNPAID_ROW)
    await nextTick()

    const hint = w.find(HINT)
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('交接')
  })

  it('改為轉帳時隱藏提示（轉帳走對帳工作區銷帳）', async () => {
    const w = mountTab()
    const vm = w.vm as unknown as TabVm
    vm.openPayDialog(UNPAID_ROW)
    await nextTick()
    vm.payForm.payment_method = '轉帳'
    await nextTick()

    expect(w.find(HINT).exists()).toBe(false)
  })
})

describe('批次收款 dialog', () => {
  const mountDialog = () =>
    shallowMount(BatchPayDialog, {
      props: {
        modelValue: true,
        records: [
          {
            id: 1,
            student_name: '甲生',
            classroom_name: '測試班',
            fee_item_name: '月費',
            period: '115-1',
            amount_due: 10800,
            amount_paid: 0,
          },
        ],
      },
      global: { stubs: { teleport: true } },
    })

  it('預設現金時顯示交接批提示', async () => {
    const w = mountDialog()
    await nextTick()
    expect(w.find(HINT).exists()).toBe(true)
  })

  it('改為轉帳時隱藏提示', async () => {
    const w = mountDialog()
    await nextTick()
    ;(w.vm as unknown as { form: { payment_method: string } }).form.payment_method =
      '轉帳'
    await nextTick()
    expect(w.find(HINT).exists()).toBe(false)
  })
})
