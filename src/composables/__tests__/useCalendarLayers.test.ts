import { describe, it, expect, beforeEach } from 'vitest'
import { useCalendarLayers } from '../useCalendarLayers'
import type { CalendarFeedItem } from '@/api/calendar'

const STORAGE_KEY = 'calendar.enabledLayers'

function makeItem(layer: CalendarFeedItem['layer'], start: string): CalendarFeedItem {
  return {
    layer,
    id: `${layer}-${start}`,
    title: 't',
    start,
    end: start,
    all_day: true,
    color: '#000',
    link: null,
    meta: {},
  }
}

describe('useCalendarLayers', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY)
  })

  it('defaults to all 6 layers enabled', () => {
    const { enabledLayers } = useCalendarLayers()
    expect(enabledLayers.value.size).toBe(6)
  })

  it('persists toggle to localStorage', async () => {
    const { toggle } = useCalendarLayers()
    toggle('leave')
    // watcher fires on next tick
    await new Promise((r) => setTimeout(r, 0))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    expect(saved).not.toContain('leave')
    expect(saved.length).toBe(5)
  })

  it('reads from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['event', 'holiday']))
    const { enabledLayers } = useCalendarLayers()
    expect(enabledLayers.value).toEqual(new Set(['event', 'holiday']))
  })

  it('filteredItems hides items whose layer is disabled', () => {
    const { setItems, toggle, filteredItems } = useCalendarLayers()
    setItems([makeItem('event', '2026-05-01'), makeItem('leave', '2026-05-02')])
    toggle('leave')
    expect(filteredItems.value).toHaveLength(1)
    expect(filteredItems.value[0].layer).toBe('event')
  })

  it('groupByDate buckets items by start date', () => {
    const { setItems, groupByDate } = useCalendarLayers()
    setItems([
      makeItem('event', '2026-05-01'),
      makeItem('leave', '2026-05-01'),
      makeItem('event', '2026-05-02'),
    ])
    expect(groupByDate.value['2026-05-01']).toHaveLength(2)
    expect(groupByDate.value['2026-05-02']).toHaveLength(1)
  })

  it('enableAll / disableAll work', () => {
    const { enabledLayers, disableAll, enableAll } = useCalendarLayers()
    disableAll()
    expect(enabledLayers.value.size).toBe(0)
    enableAll()
    expect(enabledLayers.value.size).toBe(6)
  })
})
