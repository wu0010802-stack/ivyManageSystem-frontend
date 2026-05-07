import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceMonthSticky from '@/views/portal/components/attendance/AttendanceMonthSticky.vue'

const STUBS = {
  ElIcon: { template: '<i><slot /></i>' },
}

describe('AttendanceMonthSticky', () => {
  it('renders year/month label when visible', () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 5, isCurrentMonth: true },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('2026')
    expect(w.text()).toContain('05')
  })

  it('hides bar when visible=false (transition v-show)', () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: false, year: 2026, month: 5, isCurrentMonth: true },
      global: { stubs: STUBS },
    })
    const bar = w.find('.sticky-month-bar')
    if (bar.exists()) {
      // v-show=false 會設 display:none
      expect(bar.attributes('style') || '').toMatch(/display:\s*none/)
    }
  })

  it('shows today button only when isCurrentMonth=true', () => {
    const wCurrent = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 5, isCurrentMonth: true },
      global: { stubs: STUBS },
    })
    expect(wCurrent.find('.sticky-bar__today').exists()).toBe(true)

    const wOther = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 4, isCurrentMonth: false },
      global: { stubs: STUBS },
    })
    expect(wOther.find('.sticky-bar__today').exists()).toBe(false)
  })

  it('emits prev / next / today on respective buttons', async () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 5, isCurrentMonth: true },
      global: { stubs: STUBS },
    })
    const buttons = w.findAll('button')
    // [0] prev, [1] next, [2] today
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')
    expect(w.emitted('prev')).toHaveLength(1)
    expect(w.emitted('next')).toHaveLength(1)
    expect(w.emitted('today')).toHaveLength(1)
  })

  it('does not emit today when not current month (no today button)', async () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 4, isCurrentMonth: false },
      global: { stubs: STUBS },
    })
    expect(w.find('.sticky-bar__today').exists()).toBe(false)
    expect(w.emitted('today')).toBeUndefined()
  })

  it('pads month to 2 digits in label', () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 3, isCurrentMonth: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('03')
  })
})
