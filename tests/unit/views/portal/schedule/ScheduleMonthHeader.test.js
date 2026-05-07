import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ScheduleMonthHeader from '@/views/portal/components/schedule/ScheduleMonthHeader.vue'

const STUBS = {
  ElButton: {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    props: ['size', 'class'],
    emits: ['click'],
  },
}

describe('ScheduleMonthHeader', () => {
  it('renders year/month label', () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: null },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('2026')
    expect(w.text()).toContain('5')
  })

  it('renders 上月 and 下月 button text', () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: null },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('上月')
    expect(w.text()).toContain('下月')
  })

  it('renders summary when provided', () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: { total_hours: 168, work_days: 21 } },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('168')
    expect(w.text()).toContain('21')
  })

  it('hides summary block when summary is null', () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: null },
      global: { stubs: STUBS },
    })
    expect(w.find('.month-summary').exists()).toBe(false)
  })

  it('emits prev on 上月 button click', async () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: null },
      global: { stubs: STUBS },
    })
    const buttons = w.findAll('button')
    // [0] = 上月, [1] = 下月
    await buttons[0].trigger('click')
    expect(w.emitted('prev')).toHaveLength(1)
    expect(w.emitted('next')).toBeFalsy()
  })

  it('emits next on 下月 button click', async () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: null },
      global: { stubs: STUBS },
    })
    const buttons = w.findAll('button')
    await buttons[1].trigger('click')
    expect(w.emitted('next')).toHaveLength(1)
    expect(w.emitted('prev')).toBeFalsy()
  })

  it('handles partial summary (only total_hours)', () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: { total_hours: 100 } },
      global: { stubs: STUBS },
    })
    expect(w.find('.month-summary').exists()).toBe(true)
    expect(w.text()).toContain('100')
    expect(w.text()).not.toContain('排班天數')
  })

  it('handles partial summary (only work_days)', () => {
    const w = mount(ScheduleMonthHeader, {
      props: { year: 2026, month: 5, summary: { work_days: 20 } },
      global: { stubs: STUBS },
    })
    expect(w.find('.month-summary').exists()).toBe(true)
    expect(w.text()).toContain('20')
    expect(w.text()).not.toContain('總工時')
  })
})
