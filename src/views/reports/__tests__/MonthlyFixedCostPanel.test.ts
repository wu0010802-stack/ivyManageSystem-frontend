import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, inject, provide } from 'vue'

const perms = vi.hoisted(() => ({ canWrite: true }))

vi.mock('@/api/monthlyFixedCost', () => ({
  getMonthlyFixedCosts: vi.fn().mockResolvedValue([
    { month: 1, category: 'rent', amount: 500000 },
  ]),
  batchUpsertMonthlyFixedCosts: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (p: string) => (p === 'VENDOR_PAYMENT_WRITE' ? perms.canWrite : true),
}))
vi.mock('element-plus', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: vi.fn().mockResolvedValue(true) }),
}))

import { ElMessage } from 'element-plus'
import { getMonthlyFixedCosts, batchUpsertMonthlyFixedCosts } from '@/api/monthlyFixedCost'
import MonthlyFixedCostPanel from '@/views/reports/MonthlyFixedCostPanel.vue'

// el-dropdown 的 popper 在 happy-dom 不好操作：用最小 stub 還原「點選項 → emit command」的契約
const DropdownStub = defineComponent({
  emits: ['command'],
  setup(_, { emit, slots }) {
    provide('dropdown-command', (c: unknown) => emit('command', c))
    return () => h('div', { class: 'dropdown-stub' }, [slots.default?.(), slots.dropdown?.()])
  },
})
const DropdownItemStub = defineComponent({
  props: { command: { type: String, default: '' }, disabled: Boolean },
  setup(props, { slots }) {
    const fire = inject<(c: unknown) => void>('dropdown-command')
    return () =>
      h(
        'div',
        { class: 'dropdown-item-stub', onClick: () => { if (!props.disabled) fire?.(props.command) } },
        slots.default?.(),
      )
  },
})
const globalStubs = {
  'el-dropdown': DropdownStub,
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': DropdownItemStub,
  'el-empty': { props: ['description'], template: '<p class="empty-stub">{{ description }}</p>' },
}

// 假今天 2026-07-10：今年截止月 = 7、2025 = 過去年（12）、2027 = 未來年度（0）
beforeEach(() => {
  perms.canWrite = true
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-10T00:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
})

async function mountPanel(props: { year: number; highlightMonth?: number } = { year: 2026 }) {
  const w = mount(MonthlyFixedCostPanel, {
    props,
    attachTo: document.body,
    global: { stubs: globalStubs },
  })
  await flushPromises()
  return w
}

type Wrapper = Awaited<ReturnType<typeof mountPanel>>
const input = (w: Wrapper, month: number, category: string) =>
  w.find(`[data-cell-key="${month}-${category}"] input`)
const inputValue = (w: Wrapper, month: number, category: string) =>
  (input(w, month, category).element as HTMLInputElement).value
const isDirtyCell = (w: Wrapper, month: number, category: string) =>
  w.find(`[data-cell-key="${month}-${category}"]`).classes().includes('cell-dirty')

describe('月份表頭登錄狀態與副標', () => {
  it('截止月以內：有存金額＝已登錄、沒存＝未登錄；未來月＝預登錄', async () => {
    const w = await mountPanel() // 2026：rent 1 月已有 500000
    const text = (m: number) => w.find(`[data-test="month-status-${m}"]`).text()
    expect(text(1)).toBe('已登錄')
    expect(text(2)).toBe('未登錄')
    expect(text(7)).toBe('未登錄') // 本月也算截止月以內
    expect(text(8)).toBe('預登錄')
    expect(text(12)).toBe('預登錄')
    expect(w.find('[data-test="month-status-2"]').classes()).toContain('month-status--missing')
    expect(w.find('[data-test="month-status-8"]').classes()).toContain('month-status--planned')
  })

  it('登錄狀態只看「已儲存」的金額：填了還沒存的月份仍是未登錄', async () => {
    const w = await mountPanel()
    await input(w, 2, 'rent').setValue('300000')
    expect(w.find('[data-test="month-status-2"]').text()).toBe('未登錄')
    expect(w.find('[data-test="subtitle"]').text()).toContain('已登錄 1 / 7 個月')
  })

  it('副標：今年顯示「已登錄 X / Y 個月（含本月）」', async () => {
    const w = await mountPanel()
    const sub = w.find('[data-test="subtitle"]').text()
    expect(sub).toContain('2026 年')
    expect(sub).toContain('已登錄 1 / 7 個月（含本月）')
    expect(sub).toContain('虛線斜體是參考金額，不會自動帶入')
  })

  it('副標：過去年度 Y = 12 且不寫「含本月」；未來年度改寫「尚未開始」', async () => {
    const past = await mountPanel({ year: 2025 })
    const pastSub = past.find('[data-test="subtitle"]').text()
    expect(pastSub).toContain('已登錄 1 / 12 個月')
    expect(pastSub).not.toContain('含本月')

    const future = await mountPanel({ year: 2027 })
    expect(future.find('[data-test="subtitle"]').text()).toBe('2027 年 · 尚未開始，可先預登錄')
    // 未來年度沒存過的月份＝預登錄；已有存檔金額的月份仍是「已登錄」
    expect(future.find('[data-test="month-status-2"]').text()).toBe('預登錄')
    expect(future.find('[data-test="month-status-1"]').text()).toBe('已登錄')
  })

  it('深連結月份標示於表頭與合計，不改動金額', async () => {
    const w = await mountPanel({ year: 2025, highlightMonth: 8 })
    expect(w.find('thead .col-current').text()).toContain('8 月')
    expect(w.find('[data-month-total="8"]').classes()).toContain('col-current')
    expect(inputValue(w, 1, 'rent')).toBe('500,000')
    expect(w.text()).toContain('目前核對 2025 年 8 月')
  })
})

describe('每列「帶入」只填空格', () => {
  it('只有設定參考金額的類別才有帶入入口，且顯示「參考 500,000」', async () => {
    const w = await mountPanel()
    expect(w.find('[data-test="fill-rent"]').exists()).toBe(true)
    expect(w.find('[data-test="fill-meals"]').exists()).toBe(true)
    expect(w.find('[data-test="fill-water"]').exists()).toBe(false)
    expect(w.find('[data-category="rent"] .ref-text').text()).toBe('參考 500,000')
    expect(w.find('[data-test="fill-unfilled-rent"]').text()).toBe('帶入未登錄的月份（1–7 月）')
  })

  it('帶入未登錄的月份：截止月內的空格被填入並變 dirty，已存值與編輯中的值不覆蓋', async () => {
    const w = await mountPanel()
    await input(w, 3, 'rent').setValue('123') // 已編輯
    await w.find('[data-test="fill-unfilled-rent"]').trigger('click')

    expect(inputValue(w, 1, 'rent')).toBe('500,000') // 已存值不動
    expect(isDirtyCell(w, 1, 'rent')).toBe(false)
    expect(inputValue(w, 3, 'rent')).toBe('123') // 編輯中不覆蓋
    for (const m of [2, 4, 5, 6, 7]) {
      expect(inputValue(w, m, 'rent')).toBe('500,000')
      expect(isDirtyCell(w, m, 'rent')).toBe(true)
    }
    // 未來月不在「未登錄的月份」範圍內
    expect(inputValue(w, 8, 'rent')).toBe('')
    expect(isDirtyCell(w, 8, 'rent')).toBe(false)
    expect((w.emitted('update:dirty') as boolean[][]).at(-1)?.[0]).toBe(true)
  })

  it('帶入全年（含預登錄）：連未來月的空格一起填，仍不覆蓋已存值', async () => {
    const w = await mountPanel()
    await w.find('[data-test="fill-all-rent"]').trigger('click')
    expect(inputValue(w, 1, 'rent')).toBe('500,000')
    expect(isDirtyCell(w, 1, 'rent')).toBe(false)
    for (const m of [2, 8, 12]) {
      expect(inputValue(w, m, 'rent')).toBe('500,000')
      expect(isDirtyCell(w, m, 'rent')).toBe(true)
    }
    // 其他類別不受影響
    expect(inputValue(w, 2, 'meals')).toBe('')
  })

  it('使用者清掉的已存格不算空格，帶入不會把它填回去', async () => {
    const w = await mountPanel()
    await input(w, 1, 'rent').setValue('')
    expect(isDirtyCell(w, 1, 'rent')).toBe(true)
    await w.find('[data-test="fill-all-rent"]').trigger('click')
    expect(inputValue(w, 1, 'rent')).toBe('')
  })

  it('無寫入權限：不顯示帶入入口、儲存列，格子唯讀', async () => {
    perms.canWrite = false
    const w = await mountPanel()
    expect(w.find('[data-test="fill-rent"]').exists()).toBe(false)
    expect(w.find('[data-category="rent"] .ref-text').exists()).toBe(true)
    expect((input(w, 1, 'rent').element as HTMLInputElement).disabled).toBe(true)
    expect(w.find('[data-test="save-bar"]').exists()).toBe(false)
  })
})

describe('合計', () => {
  it('截止月以內合計為 0 顯示「未登錄」，未來月留白，有金額照顯示', async () => {
    const w = await mountPanel()
    expect(w.find('[data-month-total="1"]').text()).toBe('500,000')
    expect(w.find('[data-month-total="2"]').text()).toBe('未登錄')
    expect(w.find('[data-month-total="7"]').text()).toBe('未登錄')
    expect(w.find('[data-month-total="8"]').text()).toBe('') // 未來月不叫「未登錄」
    expect(w.find('[data-row-total="rent"]').text()).toBe('500,000')
    expect(w.find('[data-row-total="water"]').text()).toBe('未登錄')
    expect(w.find('[data-grand-total]').text()).toBe('500,000')
  })

  it('合計含編輯中的值，並在下方標「未儲存」', async () => {
    const w = await mountPanel()
    expect(w.find('[data-test="month-unsaved-2"]').exists()).toBe(false)
    await input(w, 2, 'meals').setValue('4500')
    const feb = w.find('[data-month-total="2"]')
    expect(feb.text()).toContain('4,500')
    expect(feb.text()).toContain('未儲存')
    expect(w.find('[data-row-total="meals"]').text()).toContain('4,500')
    expect(w.find('[data-grand-total]').text()).toContain('504,500')
    // 沒動到的月份不標
    expect(w.find('[data-month-total="3"]').text()).not.toContain('未儲存')
  })
})

describe('底部儲存列', () => {
  it('沒有修改時不出現；有修改才出現並顯示格數與類別月份', async () => {
    const w = await mountPanel()
    expect(w.find('[data-test="save-bar"]').exists()).toBe(false)

    await input(w, 7, 'rent').setValue('1')
    await input(w, 8, 'rent').setValue('2')
    await input(w, 9, 'rent').setValue('3')
    await input(w, 9, 'meals').setValue('4')
    expect(w.find('[data-test="save-bar"]').exists()).toBe(true)
    expect(w.find('[data-test="dirty-count"]').text()).toBe('4 格未儲存')
    expect(w.find('[data-test="save-bar"]').text()).toContain('租金支出 7–9 月、餐點採購 9 月')
    expect(w.find('[data-test="save-all-btn"]').text()).toBe('儲存 4 格')
    // 舊的頂部「儲存全部」工具列已移除
    expect(w.text()).not.toContain('儲存全部')
  })

  it('放棄變更：已編輯的格子還原成已儲存值，儲存列消失', async () => {
    const w = await mountPanel()
    await input(w, 1, 'rent').setValue('600000') // 已存格改值
    await input(w, 2, 'rent').setValue('300000') // 空格填值
    expect(w.find('[data-test="dirty-count"]').text()).toBe('2 格未儲存')

    await w.find('[data-test="discard-btn"]').trigger('click')
    expect(inputValue(w, 1, 'rent')).toBe('500,000')
    expect(inputValue(w, 2, 'rent')).toBe('')
    expect(w.find('[data-test="save-bar"]').exists()).toBe(false)
    expect((w.emitted('update:dirty') as boolean[][]).at(-1)?.[0]).toBe(false)
    expect(batchUpsertMonthlyFixedCosts).not.toHaveBeenCalled()
  })

  it('儲存成功：送出 dirty 格、重新載入、emit saved', async () => {
    const w = await mountPanel()
    await input(w, 2, 'rent').setValue('300,000')
    vi.mocked(getMonthlyFixedCosts).mockResolvedValueOnce([
      { month: 1, category: 'rent', amount: 500000 },
      { month: 2, category: 'rent', amount: 300000 },
    ])
    await w.find('[data-test="save-all-btn"]').trigger('click')
    await flushPromises()

    expect(batchUpsertMonthlyFixedCosts).toHaveBeenCalledWith(2026, [
      { month: 2, category: 'rent', amount: 300000 },
    ])
    expect(ElMessage.success).toHaveBeenCalledWith('已儲存 1 格')
    expect(w.emitted('saved')).toHaveLength(1)
    // 重新載入後 dirty 清零、儲存列消失、2 月變成已登錄
    expect(w.find('[data-test="save-bar"]').exists()).toBe(false)
    expect(w.find('[data-test="month-status-2"]').text()).toBe('已登錄')
    expect(w.find('[data-test="subtitle"]').text()).toContain('已登錄 2 / 7 個月')
  })

  it('儲存失敗：不 emit saved，編輯中的值與儲存列保留', async () => {
    const w = await mountPanel()
    await input(w, 2, 'rent').setValue('300000')
    vi.mocked(batchUpsertMonthlyFixedCosts).mockRejectedValueOnce(new Error('boom'))
    await w.find('[data-test="save-all-btn"]').trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalled()
    expect(w.emitted('saved')).toBeUndefined()
    expect(w.find('[data-test="save-bar"]').exists()).toBe(true)
    expect(inputValue(w, 2, 'rent')).toBe('300,000')
  })
})

describe('載入失敗', () => {
  it('403 提示需要讀取權限，文案不露出權限代碼', async () => {
    vi.mocked(getMonthlyFixedCosts).mockRejectedValueOnce({ response: { status: 403 } })
    const w = await mountPanel()
    const shown = w.find('.empty-stub').text()
    expect(shown).toBe('需要廠商付款的讀取權限，請洽管理員開通。')
    expect(w.text()).not.toContain('VENDOR_PAYMENT_READ')
    const toast = vi.mocked(ElMessage.error).mock.calls[0][0] as string
    expect(toast).not.toContain('VENDOR_PAYMENT_READ')
    // 載入失敗時副標不顯示假的「已登錄 0 / 7」
    expect(w.find('[data-test="subtitle"]').text()).not.toContain('已登錄')
  })
})

describe('千分位輸入顯示（spec §9）', () => {
  it('未 focus 的 cell 顯示千分位、focus 後切回純數字', async () => {
    const w = await mountPanel()
    const el = input(w, 1, 'rent')
    expect((el.element as HTMLInputElement).value).toBe('500,000')
    await el.trigger('focus')
    expect((el.element as HTMLInputElement).value).toBe('500000')
    await el.trigger('blur')
    expect((el.element as HTMLInputElement).value).toBe('500,000')
  })

  it('輸入含逗號字串可正確解析（500,000 → 500000）', async () => {
    const w = await mountPanel()
    const el = input(w, 2, 'rent')
    await el.trigger('focus')
    await el.setValue('500,000')
    await el.trigger('blur')
    expect((el.element as HTMLInputElement).value).toBe('500,000')
  })
})

describe('原值對照與當月高亮', () => {
  it('改 dirty 格後顯示原值；原本沒存的格子顯示「原 未登錄」', async () => {
    const w = await mountPanel()
    await input(w, 1, 'rent').setValue('600000')
    expect(w.find('[data-test="orig-1-rent"]').text()).toContain('500,000')
    await input(w, 2, 'rent').setValue('1000')
    expect(w.find('[data-test="orig-2-rent"]').text()).toContain('未登錄')
  })

  it('檢視今年時當月（7 月）th 帶 col-current', async () => {
    const w = await mountPanel()
    const headers = w.findAll('thead th.col-month')
    expect(headers[6].classes()).toContain('col-current')
    expect(headers[5].classes()).not.toContain('col-current')
  })
})

describe('鍵盤導航', () => {
  it('資料載入完成後 Enter 鍵可從 r0c0 移焦點到 r1c0（條件渲染補綁測試）', async () => {
    const w = await mountPanel()
    const r0c0 = w.find('input[data-grid-row="0"][data-grid-col="0"]').element as HTMLInputElement
    r0c0.focus()
    r0c0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    const r1c0 = w.find('input[data-grid-row="1"][data-grid-col="0"]').element as HTMLInputElement
    expect(document.activeElement).toBe(r1c0)
  })
})
