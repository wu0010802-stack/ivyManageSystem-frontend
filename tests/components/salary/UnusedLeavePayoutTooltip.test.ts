// tests/components/salary/UnusedLeavePayoutTooltip.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockLogs = [
  {
    log_id: 1,
    source_type: 'comp_grant_expiry',
    hours: 4,
    hourly_wage: 200,
    amount: 800,
    wage_basis_date: '2026-04-01',
  },
  {
    log_id: 2,
    source_type: 'annual_anniversary',
    hours: 16,
    hourly_wage: 220,
    amount: 3520,
    wage_basis_date: '2026-08-15',
  },
]

// vi.mock 會被 hoisted 到檔案頂部，factory 內不可引用外部 let/const 變數。
// 透過 vi.hoisted 產生 mock fn 並在 factory 中引用，避免 hoisting 順序問題。
const { mockGetDetail } = vi.hoisted(() => ({
  mockGetDetail: vi.fn(),
}))

vi.mock('@/api/leaveQuotaExpiry', () => ({
  getUnusedLeavePayoutDetail: mockGetDetail,
}))

import UnusedLeavePayoutTooltip from '@/components/salary/UnusedLeavePayoutTooltip.vue'

describe('UnusedLeavePayoutTooltip', () => {
  beforeEach(() => {
    mockGetDetail.mockReset()
    mockGetDetail.mockResolvedValue({ data: { logs: mockLogs } })
  })

  it('trigger 顯示格式化金額', () => {
    const wrapper = mount(UnusedLeavePayoutTooltip, {
      props: { salaryRecordId: 123, amount: 4320 },
      global: { plugins: [ElementPlus] },
    })
    // trigger 區塊應包含千分位格式金額
    expect(wrapper.text()).toContain('4,320')
  })

  it('trigger 含 info-icon', () => {
    const wrapper = mount(UnusedLeavePayoutTooltip, {
      props: { salaryRecordId: 123, amount: 800 },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find('.trigger').exists()).toBe(true)
    expect(wrapper.find('.info-icon').exists()).toBe(true)
  })

  it('amount=0 仍能正確顯示 $0', () => {
    const wrapper = mount(UnusedLeavePayoutTooltip, {
      props: { salaryRecordId: 123, amount: 0 },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.text()).toContain('$0')
  })

  it('salaryRecordId <= 0 時，loadDetail 不發 API 請求', async () => {
    const wrapper = mount(UnusedLeavePayoutTooltip, {
      props: { salaryRecordId: 0, amount: 800 },
      global: { plugins: [ElementPlus] },
    })
    await (wrapper.vm as unknown as { loadDetail: () => Promise<void> }).loadDetail()
    await flushPromises()
    expect(mockGetDetail).not.toHaveBeenCalled()
  })

  it('salaryRecordId > 0 時，loadDetail 呼叫 getUnusedLeavePayoutDetail', async () => {
    const wrapper = mount(UnusedLeavePayoutTooltip, {
      props: { salaryRecordId: 123, amount: 4320 },
      global: { plugins: [ElementPlus] },
    })
    await (wrapper.vm as unknown as { loadDetail: () => Promise<void> }).loadDetail()
    await flushPromises()
    expect(mockGetDetail).toHaveBeenCalledWith(123)
  })

  it('重複呼叫 loadDetail 不重複發請求（loaded guard）', async () => {
    const wrapper = mount(UnusedLeavePayoutTooltip, {
      props: { salaryRecordId: 123, amount: 4320 },
      global: { plugins: [ElementPlus] },
    })
    const vm = wrapper.vm as unknown as { loadDetail: () => Promise<void> }
    await vm.loadDetail()
    await flushPromises()
    await vm.loadDetail()
    await flushPromises()
    expect(mockGetDetail).toHaveBeenCalledTimes(1)
  })

  it('API 失敗時 logs 為空陣列，不拋錯', async () => {
    mockGetDetail.mockRejectedValue(new Error('Network error'))
    const wrapper = mount(UnusedLeavePayoutTooltip, {
      props: { salaryRecordId: 123, amount: 4320 },
      global: { plugins: [ElementPlus] },
    })
    const vm = wrapper.vm as unknown as {
      loadDetail: () => Promise<void>
      logs: Array<Record<string, unknown>>
    }
    await vm.loadDetail()
    await flushPromises()
    expect(vm.logs).toEqual([])
  })
})
