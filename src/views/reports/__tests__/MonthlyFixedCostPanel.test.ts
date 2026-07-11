import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// 千分位輸入／當月高亮測試專用：year=2026（fake timers 固定 2026-07-10，isCurrentYear=true）
async function mountLoaded() {
  const w = mount(MonthlyFixedCostPanel, { props: { year: 2026 }, attachTo: document.body })
  await flushPromises()
  return w
}

describe('MonthlyFixedCostPanel 套用到全年', () => {
  it('套用後該類 12 月 current 一致且全 dirty，emit update:dirty', async () => {
    promptMock.mockResolvedValue({ value: '12345' })
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="apply-year-rent"]').trigger('click')
    await flushPromises()
    // 12 個 rent cell 都應為 12345（未 focus 顯示千分位，spec §9）
    const inputs = w.findAll('input[data-grid-row="0"]')
    expect(inputs).toHaveLength(12)
    inputs.forEach((i) => expect((i.element as HTMLInputElement).value).toBe('12,345'))
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

describe('MonthlyFixedCostPanel spec §9（sticky/當月高亮/千分位）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T00:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('千分位輸入顯示（spec §9）', () => {
    it('未 focus 的 cell 顯示千分位、focus 後切回純數字', async () => {
      const w = await mountLoaded() // 既有 helper；rent 1 月已有 500000
      const input = w.find('[data-cell-key="1-rent"] input')
      expect((input.element as HTMLInputElement).value).toBe('500,000')
      await input.trigger('focus')
      expect((input.element as HTMLInputElement).value).toBe('500000')
      await input.trigger('blur')
      expect((input.element as HTMLInputElement).value).toBe('500,000')
    })
    it('輸入含逗號字串可正確解析（500,000 → 500000）', async () => {
      const w = await mountLoaded()
      const input = w.find('[data-cell-key="2-rent"] input')
      await input.trigger('focus')
      await input.setValue('500,000')
      await input.trigger('blur')
      expect((input.element as HTMLInputElement).value).toBe('500,000')
    })
  })

  describe('當月欄高亮', () => {
    it('檢視今年時當月（7 月）th 帶 col-current', async () => {
      const w = await mountLoaded()
      const headers = w.findAll('thead th.col-month')
      expect(headers[6].classes()).toContain('col-current')
      expect(headers[5].classes()).not.toContain('col-current')
    })
  })
})
