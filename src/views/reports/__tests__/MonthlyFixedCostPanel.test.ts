import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/monthlyFixedCost', () => ({
  getMonthlyFixedCosts: vi.fn().mockResolvedValue([
    { month: 1, category: 'rent', amount: 500000 },
  ]),
  batchUpsertMonthlyFixedCosts: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
const promptMock = vi.fn()
vi.mock('element-plus', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    ElMessageBox: { prompt: (...a: unknown[]) => promptMock(...a) },
  }
})
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: vi.fn().mockResolvedValue(true) }),
}))

import MonthlyFixedCostPanel from '@/views/reports/MonthlyFixedCostPanel.vue'

beforeEach(() => { promptMock.mockReset() })

function mountPanel() {
  return mount(MonthlyFixedCostPanel, { props: { year: 2025 }, attachTo: document.body })
}

describe('MonthlyFixedCostPanel 套用到全年', () => {
  it('套用後該類 12 月 current 一致且全 dirty，emit update:dirty', async () => {
    promptMock.mockResolvedValue({ value: '12345' })
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="apply-year-rent"]').trigger('click')
    await flushPromises()
    // 12 個 rent cell 都應為 12345
    const inputs = w.findAll('input[data-grid-row="0"]')
    expect(inputs).toHaveLength(12)
    inputs.forEach((i) => expect((i.element as HTMLInputElement).value).toBe('12345'))
    // dirty emit 為 true
    const dirtyEvents = w.emitted('update:dirty') as boolean[][]
    expect(dirtyEvents.at(-1)?.[0]).toBe(true)
  })
})

describe('MonthlyFixedCostPanel 原值對照', () => {
  it('改 dirty 格後顯示原值', async () => {
    const w = mountPanel()
    await flushPromises()
    const rentJan = w.find('input[data-grid-row="0"][data-grid-col="0"]')
    await rentJan.setValue('600000')
    expect(w.find('[data-test="orig-1-rent"]').text()).toContain('500,000')
  })
})

describe('MonthlyFixedCostPanel 鍵盤導航', () => {
  it('資料載入完成後 Enter 鍵可從 r0c0 移焦點到 r1c0（條件渲染補綁測試）', async () => {
    const w = mountPanel()
    // 資料載入完成 → skeleton 消失 → fc-scroll div 渲染 → gridRef 解析
    await flushPromises()

    const r0c0 = w.find('input[data-grid-row="0"][data-grid-col="0"]').element as HTMLInputElement
    r0c0.focus()
    r0c0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    const r1c0 = w.find('input[data-grid-row="1"][data-grid-col="0"]').element as HTMLInputElement
    expect(document.activeElement).toBe(r1c0)
    w.unmount()
  })
})
