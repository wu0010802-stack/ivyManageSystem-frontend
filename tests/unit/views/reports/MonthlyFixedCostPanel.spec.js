/**
 * MonthlyFixedCostPanel.spec.js
 *
 * 驗證固定費用登錄面板：
 *  1. 渲染 8 category × 12 month = 96 cells（input[type=number]）
 *  2. 改一個 cell 變 dirty → save 按鈕 enabled → 點擊呼 batch 含正確 entries
 *  3. 多 cell dirty → batch 含全部 dirty entries
 *  4. 儲存成功後重抓 + dirty 清零 → save 按鈕 disabled
 *  5. 無寫權限：所有 input disabled、無 save button、警示訊息顯示
 *  6. year prop 改變 → refetch
 *  7. category 合計與月度合計即時更新
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const { mockGet, mockBatch, mockHasPermission, mockInvalidateCachedAsync } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockBatch: vi.fn(),
  mockHasPermission: vi.fn(),
  mockInvalidateCachedAsync: vi.fn(),
}))

vi.mock('@/api/monthlyFixedCost', () => ({
  getMonthlyFixedCosts: mockGet,
  batchUpsertMonthlyFixedCosts: mockBatch,
  upsertMonthlyFixedCost: vi.fn(),
  deleteMonthlyFixedCost: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: mockHasPermission,
}))

vi.mock('@/composables/useCachedAsync', () => ({
  invalidateCachedAsync: mockInvalidateCachedAsync,
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

import MonthlyFixedCostPanel from '@/views/reports/MonthlyFixedCostPanel.vue'

// 簡單 stub：el-skeleton / el-empty / el-alert / el-button
const ElSkeleton = defineComponent({
  name: 'ElSkeleton',
  props: ['rows', 'animated'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-skeleton' }, slots.default?.())
  },
})
const ElEmpty = defineComponent({
  name: 'ElEmpty',
  props: ['description'],
  setup(props) {
    return () => h('div', { class: 'el-empty' }, props.description)
  },
})
const ElAlert = defineComponent({
  name: 'ElAlert',
  props: ['type', 'closable', 'showIcon', 'title'],
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: ['el-alert', `el-alert-${props.type}`] },
        [props.title, slots.default?.()]
      )
  },
})
const ElButton = defineComponent({
  name: 'ElButton',
  props: ['type', 'disabled', 'loading'],
  emits: ['click'],
  setup(props, { slots, emit }) {
    return () =>
      h(
        'button',
        {
          class: 'el-button',
          disabled: props.disabled || props.loading,
          onClick: (e) => {
            if (!(props.disabled || props.loading)) emit('click', e)
          },
        },
        slots.default?.()
      )
  },
})

const globalConfig = {
  components: {
    ElSkeleton,
    ElEmpty,
    ElAlert,
    ElButton,
  },
}

function mountPanel(props = { year: 2026 }) {
  return mount(MonthlyFixedCostPanel, { props, global: globalConfig })
}

describe('MonthlyFixedCostPanel', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockBatch.mockReset()
    mockHasPermission.mockReset()
    mockHasPermission.mockReturnValue(true)
    mockInvalidateCachedAsync.mockReset()
  })

  it('渲染 8 類別 × 12 月 = 96 個可編輯 cell', async () => {
    mockGet.mockResolvedValueOnce([])
    const w = mountPanel()
    await flushPromises()

    const inputs = w.findAll('input[type="number"]')
    expect(inputs.length).toBe(96)

    // 8 個 category row（不含月度合計列）
    const rows = w.findAll('tbody tr[data-category]')
    expect(rows.length).toBe(8)
    // 表頭 12 月 cell
    const monthHeads = w.findAll('thead th.col-month')
    expect(monthHeads.length).toBe(12)
  })

  it('掛載時依 year 呼叫 getMonthlyFixedCosts，並以 entries 預填', async () => {
    mockGet.mockResolvedValueOnce([
      { id: 1, year: 2026, month: 5, category: 'rent', amount: 500000 },
      { id: 2, year: 2026, month: 6, category: 'water', amount: 5989 },
    ])
    const w = mountPanel({ year: 2026 })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith(2026)

    // 5-rent cell value = 500000
    const rentCell = w.find('[data-cell-key="5-rent"] input')
    expect(rentCell.element.value).toBe('500000')
    // 6-water cell value = 5989
    const waterCell = w.find('[data-cell-key="6-water"] input')
    expect(waterCell.element.value).toBe('5989')
    // 未登錄的 cell（1-rent）為空字串
    const emptyCell = w.find('[data-cell-key="1-rent"] input')
    expect(emptyCell.element.value).toBe('')
  })

  it('修改一個 cell → 變 dirty → save 按鈕 enabled → 點擊送出含正確 entry', async () => {
    mockGet.mockResolvedValueOnce([])
    mockBatch.mockResolvedValueOnce({ count: 1 })
    // 第二次 load（save 後 refetch）回新狀態
    mockGet.mockResolvedValueOnce([
      { id: 1, year: 2026, month: 3, category: 'electricity', amount: 12000 },
    ])

    const w = mountPanel({ year: 2026 })
    await flushPromises()

    // 初始 save 按鈕 disabled
    const btn = w.find('[data-test="save-all-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()

    // 修改 3-electricity → 12000
    const cell = w.find('[data-cell-key="3-electricity"]')
    const input = cell.find('input')
    await input.setValue('12000')
    expect(cell.classes()).toContain('cell-dirty')
    // dirtyCount > 0 → button enabled
    expect(btn.attributes('disabled')).toBeUndefined()
    // 顯示 dirtyCount
    expect(btn.text()).toContain('1')

    // 點擊 save
    await btn.trigger('click')
    await flushPromises()

    expect(mockBatch).toHaveBeenCalledTimes(1)
    expect(mockBatch).toHaveBeenCalledWith(2026, [
      { month: 3, category: 'electricity', amount: 12000 },
    ])

    // refetch 後 dirty 清零
    expect(mockGet).toHaveBeenCalledTimes(2)
    const cellAfter = w.find('[data-cell-key="3-electricity"]')
    expect(cellAfter.classes()).not.toContain('cell-dirty')
    expect(cellAfter.find('input').element.value).toBe('12000')
    // 改完後一樣 disabled
    expect(w.find('[data-test="save-all-btn"]').attributes('disabled')).toBeDefined()
  })

  it('多 cell dirty → batch entries 含全部 dirty', async () => {
    mockGet.mockResolvedValueOnce([])
    mockBatch.mockResolvedValueOnce({ count: 3 })
    mockGet.mockResolvedValueOnce([])

    const w = mountPanel({ year: 2026 })
    await flushPromises()

    await w.find('[data-cell-key="1-rent"] input').setValue('500000')
    await w.find('[data-cell-key="2-rent"] input').setValue('500000')
    await w.find('[data-cell-key="5-water"] input').setValue('5989')

    const btn = w.find('[data-test="save-all-btn"]')
    expect(btn.text()).toContain('3')

    await btn.trigger('click')
    await flushPromises()

    expect(mockBatch).toHaveBeenCalledTimes(1)
    const [yearArg, entries] = mockBatch.mock.calls[0]
    expect(yearArg).toBe(2026)
    // 順序：先按 month 再按 category（CATEGORIES 順序：rent 先於 water）
    expect(entries).toEqual([
      { month: 1, category: 'rent', amount: 500000 },
      { month: 2, category: 'rent', amount: 500000 },
      { month: 5, category: 'water', amount: 5989 },
    ])
  })

  it('typing 相同原值不算 dirty（current === original）', async () => {
    mockGet.mockResolvedValueOnce([
      { id: 1, year: 2026, month: 5, category: 'rent', amount: 500000 },
    ])
    const w = mountPanel({ year: 2026 })
    await flushPromises()

    const cell = w.find('[data-cell-key="5-rent"]')
    // 原值 = 500000；改成 600000 再改回 500000 → 不應 dirty
    await cell.find('input').setValue('600000')
    expect(cell.classes()).toContain('cell-dirty')
    await cell.find('input').setValue('500000')
    expect(cell.classes()).not.toContain('cell-dirty')
  })

  it('無 VENDOR_PAYMENT_WRITE：所有 input disabled、無 save button、顯示警示', async () => {
    mockHasPermission.mockReturnValue(false)
    mockGet.mockResolvedValueOnce([
      { id: 1, year: 2026, month: 5, category: 'rent', amount: 500000 },
    ])
    const w = mountPanel({ year: 2026 })
    await flushPromises()

    const inputs = w.findAll('input[type="number"]')
    expect(inputs.length).toBe(96)
    for (const inp of inputs) {
      expect(inp.attributes('disabled')).toBeDefined()
    }

    // 無 save button
    expect(w.find('[data-test="save-all-btn"]').exists()).toBe(false)
    // 警示訊息
    expect(w.text()).toContain('您只有查看權限')
  })

  it('載入 403（無 VENDOR_PAYMENT_READ）時顯示明確權限提示，非通用「載入失敗」（2026-07-05 稽核 §0/P3-11）', async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Forbidden' } } })
    const w = mountPanel({ year: 2026 })
    await flushPromises()

    expect(w.text()).toContain('需要廠商付款讀取權限')
  })

  it('year prop 改變 → refetch', async () => {
    mockGet.mockResolvedValueOnce([])
    const w = mountPanel({ year: 2025 })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith(2025)
    expect(mockGet).toHaveBeenCalledTimes(1)

    mockGet.mockResolvedValueOnce([])
    await w.setProps({ year: 2026 })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith(2026)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('合計即時更新：category 跨 12 月、月度跨 8 類別', async () => {
    mockGet.mockResolvedValueOnce([])
    const w = mountPanel({ year: 2026 })
    await flushPromises()

    await w.find('[data-cell-key="1-rent"] input').setValue('500000')
    await w.find('[data-cell-key="2-rent"] input').setValue('500000')
    await w.find('[data-cell-key="1-water"] input').setValue('3000')

    // rent 合計 = 1,000,000
    const rentTotal = w.find('[data-row-total="rent"]')
    expect(rentTotal.text().replace(/\s/g, '')).toContain('1,000,000')

    // 1 月合計 = 500000 + 3000 = 503,000
    const m1Total = w.find('[data-month-total="1"]')
    expect(m1Total.text().replace(/\s/g, '')).toContain('503,000')

    // 總計 = 500000 + 500000 + 3000 = 1,003,000
    const grand = w.find('[data-grand-total]')
    expect(grand.text().replace(/\s/g, '')).toContain('1,003,000')
  })

  it('儲存成功後呼叫 invalidateCachedAsync 失效 reports/finance: 與 reports/dashboard: 前綴（2026-07-05 補 P1 缺口：固定支出併入總支出後，概況/收支彙總/薪資頁的舊快取需失效）', async () => {
    mockGet.mockResolvedValueOnce([])
    mockBatch.mockResolvedValueOnce({ count: 1 })
    mockGet.mockResolvedValueOnce([])

    const w = mountPanel({ year: 2026 })
    await flushPromises()

    await w.find('[data-cell-key="1-rent"] input').setValue('500000')
    await w.find('[data-test="save-all-btn"]').trigger('click')
    await flushPromises()

    expect(mockInvalidateCachedAsync).toHaveBeenCalledWith('reports/finance:')
    expect(mockInvalidateCachedAsync).toHaveBeenCalledWith('reports/dashboard:')
  })

  it('儲存失敗時不呼叫 invalidateCachedAsync（沒有真的變乾淨的資料，快取不該被清）', async () => {
    mockGet.mockResolvedValueOnce([])
    mockBatch.mockRejectedValueOnce(new Error('boom'))

    const w = mountPanel({ year: 2026 })
    await flushPromises()

    await w.find('[data-cell-key="1-rent"] input').setValue('500000')
    await w.find('[data-test="save-all-btn"]').trigger('click')
    await flushPromises()

    expect(mockInvalidateCachedAsync).not.toHaveBeenCalled()
  })

  it('儲存失敗時 dirty 不清空，並顯示錯誤訊息', async () => {
    const { ElMessage } = await import('element-plus')
    mockGet.mockResolvedValueOnce([])
    mockBatch.mockRejectedValueOnce(new Error('boom'))

    const w = mountPanel({ year: 2026 })
    await flushPromises()

    await w.find('[data-cell-key="1-rent"] input').setValue('500000')
    await w.find('[data-test="save-all-btn"]').trigger('click')
    await flushPromises()

    // dirty 未清
    expect(w.find('[data-cell-key="1-rent"]').classes()).toContain('cell-dirty')
    // 不應 refetch（只有初始一次）
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalled()
  })
})
