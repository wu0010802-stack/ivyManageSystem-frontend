import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import CalendarToolbar from '../CalendarToolbar.vue'
import type { CalendarLayer } from '@/api/calendar'
import { CALENDAR_LAYERS } from '@/constants/calendarLayers'

const mountWithEp = (modelValue: Set<CalendarLayer>) =>
  mount(CalendarToolbar, {
    props: { modelValue },
    global: { plugins: [ElementPlus] },
  })

describe('CalendarToolbar', () => {
  it('renders 6 layer labels', () => {
    const wrapper = mountWithEp(new Set<CalendarLayer>(CALENDAR_LAYERS))
    const html = wrapper.html()
    expect(html).toContain('行事曆')
    expect(html).toContain('假日')
    expect(html).toContain('請假')
    expect(html).toContain('才藝課')
    expect(html).toContain('考核')
    expect(html).toContain('會議')
  })

  it('emits update:modelValue with all 6 layers when 全選 clicked', async () => {
    const wrapper = mountWithEp(new Set<CalendarLayer>())
    const btn = wrapper.findAll('button').find((b) => b.text().includes('全選'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0] as Set<CalendarLayer>
    expect(last.size).toBe(6)
  })

  it('emits empty set when 清除 clicked', async () => {
    const wrapper = mountWithEp(new Set<CalendarLayer>(CALENDAR_LAYERS))
    const btn = wrapper.findAll('button').find((b) => b.text().includes('清除'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0] as Set<CalendarLayer>
    expect(last.size).toBe(0)
  })
})
