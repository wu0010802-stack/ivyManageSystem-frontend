import { describe, it, expect, beforeEach } from 'vitest'
import { useCalendarLayers, toFullCalendarEvents, applyEditable } from '../useCalendarLayers'
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

  it('groupByDate strips time portion when start is an ISO datetime', () => {
    const { setItems, groupByDate } = useCalendarLayers()
    setItems([
      {
        layer: 'event',
        id: 1,
        title: 'meeting',
        start: '2026-05-19T09:30:00',
        end: '2026-05-19T11:00:00',
        all_day: false,
        color: '#000',
        link: null,
        meta: {},
      },
    ])
    expect(groupByDate.value['2026-05-19']).toHaveLength(1)
  })

  it('fullCalendarEvents wraps filteredItems', () => {
    const { setItems, fullCalendarEvents } = useCalendarLayers()
    setItems([makeItem('event', '2026-05-01')])
    expect(fullCalendarEvents.value).toHaveLength(1)
    expect(fullCalendarEvents.value[0].id).toBe('event:event-2026-05-01')
  })
})

describe('toFullCalendarEvents', () => {
  it('emits unique id `{layer}:{id}`', () => {
    const out = toFullCalendarEvents([
      { layer: 'event', id: 7, title: 'a', start: '2026-05-19', end: '2026-05-19', all_day: true, color: '#000', link: null, meta: {} },
    ])
    expect(out[0].id).toBe('event:7')
  })

  it('omits end for single-day all-day events', () => {
    const out = toFullCalendarEvents([
      { layer: 'event', id: 1, title: 'a', start: '2026-05-19', end: '2026-05-19', all_day: true, color: '#000', link: null, meta: {} },
    ])
    expect(out[0].end).toBeUndefined()
    expect(out[0].allDay).toBe(true)
  })

  it('shifts end +1 day for multi-day all-day events (FC exclusive)', () => {
    const out = toFullCalendarEvents([
      { layer: 'event', id: 1, title: 'a', start: '2026-05-19', end: '2026-05-21', all_day: true, color: '#000', link: null, meta: {} },
    ])
    expect(out[0].end).toBe('2026-05-22')
  })

  it('passes datetime through unchanged for timed events', () => {
    const out = toFullCalendarEvents([
      { layer: 'event', id: 1, title: 'a', start: '2026-05-19T09:30:00', end: '2026-05-19T11:00:00', all_day: false, color: '#000', link: null, meta: {} },
    ])
    expect(out[0].start).toBe('2026-05-19T09:30:00')
    expect(out[0].end).toBe('2026-05-19T11:00:00')
    expect(out[0].allDay).toBe(false)
  })

  it('only event layer is editable (draggable)', () => {
    const out = toFullCalendarEvents([
      { layer: 'event', id: 1, title: 'a', start: '2026-05-19', end: '2026-05-19', all_day: true, color: '#000', link: null, meta: {} },
      { layer: 'leave', id: 2, title: 'b', start: '2026-05-19', end: '2026-05-19', all_day: true, color: '#0ea5e9', link: null, meta: {} },
    ])
    expect(out[0].editable).toBe(true)
    expect(out[1].editable).toBe(false)
  })

  it('forwards layer/link/meta/rawId to extendedProps', () => {
    const out = toFullCalendarEvents([
      { layer: 'leave', id: '7@2026-05-19', title: 'a', start: '2026-05-19', end: '2026-05-19', all_day: true, color: '#0ea5e9', link: '/leaves?id=7', meta: { status: 'approved' } },
    ])
    expect(out[0].extendedProps).toEqual({
      layer: 'leave',
      link: '/leaves?id=7',
      meta: { status: 'approved' },
      rawId: '7@2026-05-19',
    })
  })
})

describe('applyEditable', () => {
  it('editable=false 時逐 event 強制 editable:false', () => {
    const out = applyEditable(
      [{ id: 'a', editable: true }, { id: 'b', editable: false }],
      false,
    )
    expect(out.every((e) => e.editable === false)).toBe(true)
  })

  it('editable=true 時原樣返回（保留 per-event editable）', () => {
    const input = [{ id: 'a', editable: true }, { id: 'b', editable: false }]
    expect(applyEditable(input, true)).toBe(input)
  })
})
