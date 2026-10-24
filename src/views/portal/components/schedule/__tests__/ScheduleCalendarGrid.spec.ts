import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ScheduleCalendarGrid from '../ScheduleCalendarGrid.vue'

const day = (over: Record<string, unknown> = {}) => ({
  day: 10, date: '2099-10-10', is_weekend: false, shift_name: '早車', work_start: '07:00', work_end: '16:30',
  is_override: false, is_holiday: false, holiday_name: null, ...over,
})
const mountGrid = (d: ReturnType<typeof day>) => mount(ScheduleCalendarGrid, {
  props: { weeks: [[d]], isToday: () => false, isFutureDate: () => true },
  global: { plugins: [ElementPlus] },
})

describe('ScheduleCalendarGrid 國定假日（QA #11 前端）', () => {
  it('國定假日格顯示假日名稱、不顯示換班按鈕', () => {
    const w = mountGrid(day({ is_holiday: true, holiday_name: '國慶日' }))
    expect(w.get('[data-test="cell-holiday"]').text()).toBe('國慶日')
    expect(w.find('.cell-swap-btn').exists()).toBe(false)
  })

  it('一般工作日照常有換班按鈕、沒有假日標記', () => {
    const w = mountGrid(day())
    expect(w.find('[data-test="cell-holiday"]').exists()).toBe(false)
    expect(w.find('.cell-swap-btn').exists()).toBe(true)
  })
})
