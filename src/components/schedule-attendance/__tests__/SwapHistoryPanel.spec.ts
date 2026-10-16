import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SwapHistoryPanel from '../SwapHistoryPanel.vue'

const api = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock('@/api/shifts', () => ({ getSwapHistory: api.history }))
const device = vi.hoisted(() => ({ mobile: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(device.mobile) }) }
})

const row = (id: number, status: string) => ({
  id, swap_date: '2026-09-15', requester_name: '林班導', requester_shift: '早車',
  target_name: '王副導', target_shift: '晚車', reason: '家長會', status,
  target_responded_at: null, created_at: '2026-09-10 10:00',
})

beforeEach(() => {
  device.mobile = false
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

// 補登換班（SPEC-026 3-3 T10）：BE 把行政已套用的老師自行補登併進紀錄，id 是確認項目編號、會與申請單撞號。
describe('SwapHistoryPanel 補登換班列', { timeout: 20_000 }, () => {
  const backdatedRow = (id: number) => ({
    ...row(id, 'applied'), source: 'backdated', confirmation_item_id: id, reason: '臨時對調',
  })
  const requestRow = (id: number) => ({ ...row(id, 'accepted'), source: 'request', confirmation_item_id: null })

  it('補登列有「補登」標籤、狀態寫「已補登」；一般申請列沒有標籤', async () => {
    api.history.mockResolvedValue({ data: [requestRow(1), backdatedRow(2)] })
    const wrapper = mount(SwapHistoryPanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = wrapper.findAll('[data-test="swap-table"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('已接受')
    expect(rows[0].find('[data-test="swap-backdated-tag"]').exists()).toBe(false)
    expect(rows[1].text()).toContain('已補登')
    expect(rows[1].get('[data-test="swap-backdated-tag"]').text()).toBe('補登')
    expect(rows[1].text()).not.toContain('applied')
  })

  it('申請單與補登項目同 id：列 key 以來源區分，不重複', async () => {
    api.history.mockResolvedValue({ data: [requestRow(1), backdatedRow(1)] })
    const wrapper = mount(SwapHistoryPanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rowKey = wrapper.findComponent({ name: 'ElTable' }).props('rowKey') as (r: Record<string, unknown>) => string
    const keys = (api.history.mock.results[0].value as Promise<{ data: Record<string, unknown>[] }>)
    const data = (await keys).data
    expect(data.map((r) => rowKey(r))).toEqual(['request-1', 'backdated-1'])
  })

  it('舊版後端沒帶 source：視為一般申請，不出現標籤', async () => {
    api.history.mockResolvedValue({ data: [row(7, 'pending')] })
    const wrapper = mount(SwapHistoryPanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.find('[data-test="swap-backdated-tag"]').exists()).toBe(false)
    const rowKey = wrapper.findComponent({ name: 'ElTable' }).props('rowKey') as (r: Record<string, unknown>) => string
    expect(rowKey(row(7, 'pending'))).toBe('request-7')
  })

  it('手機卡片：補登標籤與「已補登」，且同 id 兩列都在（不因重複 key 吞列）', async () => {
    device.mobile = true
    api.history.mockResolvedValue({ data: [requestRow(1), backdatedRow(1)] })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(SwapHistoryPanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('已補登')
    expect(text).toContain('已接受')
    expect(wrapper.findAll('[data-test="swap-backdated-tag"]')).toHaveLength(1)
    expect(warn.mock.calls.flat().join('\n')).not.toMatch(/Duplicate keys/)
    warn.mockRestore()
  })
})
