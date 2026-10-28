import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const suggestOvertimeType = vi.fn()
vi.mock('@/api/overtimes', () => ({
  suggestOvertimeType: (...a: unknown[]) => suggestOvertimeType(...a),
}))

import { useOvertimeTypeSuggestion } from '@/composables/useOvertimeTypeSuggestion'

// mock 欄位只用 schema.d.ts OvertimeTypeSuggestionOut 有的欄位
const clear = (date: string, type: string, reason = `${date}依行事曆為工作日`) => ({
  data: { date, day_kind: type === 'weekday' ? 'workday' : 'rest_day', suggested_type: type, allowed_types: [type], reason },
})
const ambiguous = (date: string) => ({
  data: {
    date,
    day_kind: 'ambiguous',
    suggested_type: 'weekday',
    allowed_types: ['weekday', 'weekend'],
    reason: `${date}為週末，但該員工當日有排班；休息日依排班認定`,
  },
})

const setup = (autoApply = true) => {
  const form = reactive({ employee_id: null as number | null, overtime_date: '', overtime_type: 'weekday' })
  const s = useOvertimeTypeSuggestion({
    employeeId: () => form.employee_id,
    date: () => form.overtime_date,
    currentType: () => form.overtime_type,
    autoApply: () => autoApply,
    apply: (t) => { form.overtime_type = t },
  })
  return { form, s }
}

describe('useOvertimeTypeSuggestion', () => {
  beforeEach(() => suggestOvertimeType.mockReset())

  it('員工或日期未選 → 不查詢', async () => {
    const { form } = setup()
    form.employee_id = 5
    await flushPromises()
    expect(suggestOvertimeType).not.toHaveBeenCalled()
  })

  it('明確建議 → 自動帶入類型、無警示', async () => {
    suggestOvertimeType.mockResolvedValueOnce(clear('2026-10-31', 'weekend', '2026-10-31依行事曆為休息日'))
    const { form, s } = setup()
    form.employee_id = 5
    form.overtime_date = '2026-10-31'
    await flushPromises()
    expect(suggestOvertimeType).toHaveBeenCalledWith({ employee_id: 5, date: '2026-10-31' })
    expect(form.overtime_type).toBe('weekend')
    expect(s.mismatchHint.value).toBe('')
    expect(s.infoHint.value).toBe('')
  })

  it('使用者改成與建議不同 → 顯示不符警示', async () => {
    suggestOvertimeType.mockResolvedValueOnce(clear('2026-10-31', 'weekend', '2026-10-31依行事曆為休息日'))
    const { form, s } = setup()
    form.employee_id = 5
    form.overtime_date = '2026-10-31'
    await flushPromises()
    form.overtime_type = 'weekday'
    await nextTick()
    expect(s.mismatchHint.value).toContain('2026-10-31依行事曆為休息日')
    expect(s.mismatchHint.value).toContain('「假日」')
    expect(s.mismatchHint.value).toContain('退回')
  })

  it('模稜兩可 → 不改值，只顯示 reason', async () => {
    suggestOvertimeType.mockResolvedValueOnce(ambiguous('2026-11-01'))
    const { form, s } = setup()
    form.overtime_type = 'weekend'
    form.employee_id = 5
    form.overtime_date = '2026-11-01'
    await flushPromises()
    expect(form.overtime_type).toBe('weekend')
    expect(s.infoHint.value).toContain('有排班')
    expect(s.mismatchHint.value).toBe('')
  })

  it('模稜兩可但選了 holiday → 仍警示（後端只放行 weekday／weekend）', async () => {
    suggestOvertimeType.mockResolvedValueOnce(ambiguous('2026-11-01'))
    const { form, s } = setup()
    form.overtime_type = 'holiday'
    form.employee_id = 5
    form.overtime_date = '2026-11-01'
    await flushPromises()
    expect(s.mismatchHint.value).toContain('「平日」或「假日」')
  })

  it('autoApply=false（編輯既有紀錄）→ 不覆寫類型，但不符仍警示', async () => {
    suggestOvertimeType.mockResolvedValueOnce(clear('2026-10-31', 'weekend'))
    const { form, s } = setup(false)
    form.employee_id = 5
    form.overtime_date = '2026-10-31'
    await flushPromises()
    expect(form.overtime_type).toBe('weekday')
    expect(s.mismatchHint.value).not.toBe('')
  })

  it('過時回應被丟棄（先改的日期較慢回來）', async () => {
    let resolveFirst!: (v: unknown) => void
    suggestOvertimeType
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce(clear('2026-10-30', 'weekday'))
    const { form } = setup()
    form.employee_id = 5
    form.overtime_date = '2026-10-31'
    await nextTick()
    form.overtime_date = '2026-10-30'
    await flushPromises()
    resolveFirst(clear('2026-10-31', 'weekend'))
    await flushPromises()
    expect(form.overtime_type).toBe('weekday')
  })

  it('查詢失敗 → 靜默、無提示', async () => {
    suggestOvertimeType.mockRejectedValueOnce(new Error('boom'))
    const { form, s } = setup()
    form.employee_id = 5
    form.overtime_date = '2026-10-31'
    await flushPromises()
    expect(s.suggestion.value).toBeNull()
    expect(s.mismatchHint.value).toBe('')
  })
})
