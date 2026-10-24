/**
 * MonthDateStrip 空日 chip 的 a11y 契約：
 * 無紀錄的日期刻意不可選（onPick early return），但原本仍是可聚焦的普通
 * button——鍵盤/讀屏使用者會聚焦到一顆「按了沒反應」的按鈕。補上
 * aria-disabled 與 tabindex=-1，把「不可選」講給輔助科技聽。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthDateStrip from '../MonthDateStrip.vue'
import { localDateISO } from '@/parent/utils/date'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateISO(d)
}

describe('MonthDateStrip 空日 a11y', () => {
  it('無紀錄的過去日 chip 標 aria-disabled 且移出 tab 序', () => {
    const w = mount(MonthDateStrip, {
      props: { entries: [], selectedDate: null, days: 7 },
    })
    const chips = w.findAll('button.chip')
    const emptyChips = chips.filter((c) => c.classes().includes('is-empty'))
    expect(emptyChips.length).toBeGreaterThan(0)
    for (const c of emptyChips) {
      expect(c.attributes('aria-disabled')).toBe('true')
      expect(c.attributes('tabindex')).toBe('-1')
    }
  })

  it('有紀錄日與今天的 chip 不標 aria-disabled、保持可聚焦', () => {
    const entryDate = isoDaysAgo(2)
    const w = mount(MonthDateStrip, {
      props: { entries: [{ log_date: entryDate }], selectedDate: null, days: 7 },
    })
    const chips = w.findAll('button.chip')
    const active = chips.filter(
      (c) => c.classes().includes('has-entry') || c.classes().includes('is-today'),
    )
    expect(active.length).toBeGreaterThanOrEqual(2)
    for (const c of active) {
      expect(c.attributes('aria-disabled')).toBeUndefined()
      expect(c.attributes('tabindex')).toBeUndefined()
    }
  })
})
