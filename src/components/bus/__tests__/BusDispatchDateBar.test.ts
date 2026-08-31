import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BusDispatchDateBar from '../BusDispatchDateBar.vue'

function isoDaysFromToday(days: number): { iso: string; date: Date } {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return { iso, date: d }
}

const mountBar = (props: Partial<InstanceType<typeof BusDispatchDateBar>['$props']> = {}) =>
  mount(BusDispatchDateBar, {
    props: {
      modelValue: isoDaysFromToday(0).iso,
      holidayNotice: null,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })

describe('BusDispatchDateBar', () => {
  it('今天~+7 可選，範圍外 disabled（spec：可預排未來一週）', () => {
    const w = mountBar()
    const { disabledDate } = w.vm as unknown as { disabledDate: (d: Date) => boolean }
    expect(disabledDate(isoDaysFromToday(0).date)).toBe(false)
    expect(disabledDate(isoDaysFromToday(7).date)).toBe(false)
    expect(disabledDate(isoDaysFromToday(-1).date)).toBe(true)
    expect(disabledDate(isoDaysFromToday(8).date)).toBe(true)
  })

  it('假日警示條顯示且不阻擋（文案含「仍可照常發車」）', () => {
    const w = mountBar({
      holidayNotice: { is_holiday: true, label: '中秋節' },
    })
    const alert = w.find('[data-test="holiday-alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('中秋節')
    expect(alert.text()).toContain('仍可照常發車')
  })

  it('label 已是完整句子時不再套外框（後端 calendar_warnings 就是整句）', () => {
    // `services/bus_daily_plan.py::calendar_warnings` 回的是「本日為假日：中秋節」，
    // 若元件再包一層「本日為假日／非上課日（…）」就會疊字。
    const w = mountBar({
      holidayNotice: { is_holiday: true, label: '本日為假日：中秋節' },
    })
    const text = w.find('[data-test="holiday-alert"]').text()
    expect(text).toBe('本日為假日：中秋節，仍可照常發車')
    expect(text).not.toContain('非上課日（')
  })

  it('無假日不顯示警示條', () => {
    const w = mountBar({ holidayNotice: { is_holiday: false, label: '' } })
    expect(w.find('[data-test="holiday-alert"]').exists()).toBe(false)
  })

  it('「今天」快捷 emit 今日日期；已在今天時 disabled', async () => {
    const future = isoDaysFromToday(3).iso
    const w = mountBar({ modelValue: future })
    const btn = w.find('[data-test="today-btn"]')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([isoDaysFromToday(0).iso])

    const today = mountBar()
    expect(today.find('[data-test="today-btn"]').attributes('disabled')).toBeDefined()
  })
})
