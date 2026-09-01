/**
 * 現金收款會進當日交接批的提示＋帳單頁限現金（2026-09-01 業主裁定）。
 *
 * 帳單頁收現金會在同一交易建立對帳收據並掛入當日現金交接批，交接後該日
 * 不能再收（後端回 409）。會計必須在按下收款前就知道這筆錢會落到哪個交接
 * 批，否則交接時對不上帳只能事後追。
 *
 * 自限現金裁定起，帳單頁不再提供「轉帳／其他」選項（轉帳一律走對帳工作區
 * 由網銀資料銷帳回寫），繳費方式固定顯示現金、交接提示恆顯示；本檔同時守
 * 「開啟 dialog 一律以現金送出（不得沿用存量列的轉帳快照，否則後端 422）」。
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
const CASH_ONLY = '[data-test="pay-method-cash-only"]'

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

  it('顯示「計入今日現金交接批」提示（限現金後恆顯示）', async () => {
    const w = mountTab()
    ;(w.vm as unknown as TabVm).openPayDialog(UNPAID_ROW)
    await nextTick()

    const hint = w.find(HINT)
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('交接')
  })

  it('繳費方式固定現金、無選擇器，附轉帳改道對帳工作區的說明', async () => {
    const w = mountTab()
    ;(w.vm as unknown as TabVm).openPayDialog(UNPAID_ROW)
    await nextTick()

    expect(w.find(CASH_ONLY).exists()).toBe(true)
    expect(w.find('select, el-select-stub').exists()).toBe(false)
    expect(w.find('[data-test="pay-method-recon-link"]').text()).toContain('對帳')
  })

  it('存量列快照為轉帳時，開啟 dialog 仍強制現金（避免後端 422）', async () => {
    const w = mountTab()
    const vm = w.vm as unknown as TabVm
    vm.openPayDialog({ ...UNPAID_ROW, payment_method: '轉帳' } as typeof UNPAID_ROW)
    await nextTick()

    expect(vm.payForm.payment_method).toBe('現金')
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

  it('顯示交接批提示（限現金後恆顯示）', async () => {
    const w = mountDialog()
    await nextTick()
    expect(w.find(HINT).exists()).toBe(true)
  })

  it('繳費方式固定現金、無選擇器', async () => {
    const w = mountDialog()
    await nextTick()
    expect(w.find(CASH_ONLY).exists()).toBe(true)
    expect(w.find('el-select-stub').exists()).toBe(false)
    expect(
      (w.vm as unknown as { form: { payment_method: string } }).form.payment_method,
    ).toBe('現金')
  })
})
