import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import MonthDateStrip from '@/parent/components/contact-book/MonthDateStrip.vue'

/**
 * 為避免測試對 host TZ 敏感，所有 systemTime 都用「本地建構」的 Date
 * （new Date(2026, 4, 18, 8, 30)）而非 UTC ISO 字串；assertion 以結構為主
 * （chip 數量、is-today 對到的 day 是 18）。
 */
function buildEntries(dates) {
  return dates.map((iso, idx) => ({ id: idx + 1, log_date: iso }))
}

describe('MonthDateStrip — 本地日期 + 跨午夜', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('today chip 對到本地當日 (非 UTC slice)，跨午夜前後 day 數不偏移', () => {
    // 本地 2026-05-18 03:00（台灣時間零點到八點之間是 UTC 前一日）
    vi.setSystemTime(new Date(2026, 4, 18, 3, 0, 0))

    const wrapper = mount(MonthDateStrip, {
      props: {
        entries: buildEntries(['2026-05-18']),
        days: 21,
      },
    })

    const todayChip = wrapper.find('.chip.is-today')
    expect(todayChip.exists()).toBe(true)
    expect(todayChip.find('.day').text()).toBe('18')
    // 當日有紀錄 → today chip 必須 has-entry
    expect(todayChip.classes()).toContain('has-entry')
  })

  it('當日凌晨建構的 list，最後一個 chip 是「今天」（不會偏成 19）', () => {
    vi.setSystemTime(new Date(2026, 4, 18, 0, 1, 0))

    const wrapper = mount(MonthDateStrip, {
      props: { entries: [], days: 5 },
    })

    const chips = wrapper.findAll('.chip')
    expect(chips).toHaveLength(5)
    expect(chips[chips.length - 1].find('.day').text()).toBe('18')
    expect(chips[chips.length - 1].classes()).toContain('is-today')
  })

  it('過了午夜（setInterval tick）後 today chip 更新為新一天', async () => {
    // 起始：2026-05-18 23:59:30
    vi.setSystemTime(new Date(2026, 4, 18, 23, 59, 30))

    const wrapper = mount(MonthDateStrip, {
      props: { entries: [], days: 5 },
    })
    await nextTick()
    expect(wrapper.find('.chip.is-today .day').text()).toBe('18')

    // 推進 90 秒 → 2026-05-19 00:01:00
    vi.setSystemTime(new Date(2026, 4, 19, 0, 1, 0))
    vi.advanceTimersByTime(90 * 1000)
    await flushPromises()

    expect(wrapper.find('.chip.is-today .day').text()).toBe('19')
  })

  it('unmount 後 setInterval 清掉，不再 tick', async () => {
    vi.setSystemTime(new Date(2026, 4, 18, 23, 59, 30))
    const wrapper = mount(MonthDateStrip, {
      props: { entries: [], days: 5 },
    })
    await nextTick()
    const intervalsBefore = vi.getTimerCount()
    wrapper.unmount()
    const intervalsAfter = vi.getTimerCount()
    expect(intervalsAfter).toBeLessThan(intervalsBefore)
  })
})
