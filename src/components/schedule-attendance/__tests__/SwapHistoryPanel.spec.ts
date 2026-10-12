import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SwapHistoryPanel from '../SwapHistoryPanel.vue'

const api = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock('@/api/shifts', () => ({ getSwapHistory: api.history }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false) }) }
})

const row = (id: number, status: string) => ({
  id, swap_date: '2026-09-15', requester_name: '林班導', requester_shift: '早車',
  target_name: '王副導', target_shift: '晚車', reason: '家長會', status,
  target_responded_at: null, created_at: '2026-09-10 10:00',
})

beforeEach(() => {
  vi.resetAllMocks()
  api.history.mockResolvedValue({ data: [row(1, 'accepted'), row(2, 'pending')] })
})

// 掛載真 Element Plus 的表格與卡片，首條要現編元件；全套並跑或機器忙時會超過預設 5 秒而假紅（同 PortalRecordDialogs.test.ts）
describe('SwapHistoryPanel', { timeout: 20_000 }, () => {
  it('掛載即載入並顯示狀態中文', async () => {
    const wrapper = mount(SwapHistoryPanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(api.history).toHaveBeenCalledWith({})
    const text = wrapper.find('[data-test="swap-table"]').text()
    expect(text).toContain('已接受')
    expect(text).toContain('待回覆')
  })

  it('查詢只帶有值的篩選', async () => {
    const wrapper = mount(SwapHistoryPanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
    pickers[0].vm.$emit('update:modelValue', '2026-09-01')
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 'pending')
    await wrapper.find('[data-test="swap-query"]').trigger('click')
    await flushPromises()
    expect(api.history).toHaveBeenLastCalledWith({ start_date: '2026-09-01', status: 'pending' })
  })
})
