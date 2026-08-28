import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import FinanceDetailDialog from '../FinanceDetailDialog.vue'

const getFinanceSummaryDetailMock = vi.fn()
vi.mock('@/api/reports', () => ({
  getFinanceSummaryDetail: (...args: unknown[]) => getFinanceSummaryDetailMock(...args),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: { error: vi.fn() } }
})

const STUBS = {
  'el-dialog': { template: '<div><slot /></div>' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': {
    props: ['label', 'name'],
    template: '<section>{{ label }}<slot /></section>',
  },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-tag': true,
}

describe('FinanceDetailDialog 表外獎金下鑽', () => {
  it('後端回傳表外獎金時顯示獨立頁籤與筆數', async () => {
    getFinanceSummaryDetailMock.mockResolvedValue({
      data: {
        tuition: [],
        activity: [],
        misc_receipt: [],
        salary: [],
        vendor_payment: [],
        fixed_cost: [],
        year_end: [],
        extra_bonus: [{
          employee_name: '測試員工',
          category_label: '教育訓練獎勵金',
          amount: 1800,
          period: '2033-05',
          paid_date: '2033-06-20',
        }],
      },
    })
    const wrapper = mount(FinanceDetailDialog, {
      props: { modelValue: false, year: 2033, month: 6 },
      global: { stubs: STUBS },
    })

    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(getFinanceSummaryDetailMock).toHaveBeenCalledWith(2033, 6)
    expect(wrapper.text()).toContain('表外獎金 (1)')
  })
})
