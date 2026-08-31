import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayTimelineItem from '@/parent/components/home-timeline/TodayTimelineItem.vue'

const stubs = { CrownIcon: true }

function makeEvent(over = {}) {
  return {
    id: 'e1', time: null, primary: '小明 已入園', secondary: '大象班',
    tone: 'success', variant: 'past', path: '/attendance', ...over,
  }
}

describe('TodayTimelineItem — icon 化（P3）', () => {
  it('success tone 顯示 check_circle icon', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent() }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('check_circle')
  })

  it('money tone 顯示 payments icon', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ tone: 'money' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('payments')
  })

  it('未知 tone fallback 顯示 circle icon', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ tone: 'nonexistent' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('circle')
  })

  it('tdot 套 tone class', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ tone: 'money' }) }, global: { stubs } })
    expect(w.find('.tdot').classes()).toContain('tone-money')
  })

  it('點擊有 path 的 entry → emit navigate', async () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ path: '/fees' }) }, global: { stubs } })
    await w.find('.entry').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual(['/fees'])
  })

  it('無 path → entry disabled', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ path: undefined }) }, global: { stubs } })
    expect(w.find('.entry').attributes('disabled')).toBeDefined()
  })

  it('有 time 時顯示時間', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ time: '08:12' }) }, global: { stubs } })
    expect(w.find('.time').text()).toBe('08:12')
  })
})
