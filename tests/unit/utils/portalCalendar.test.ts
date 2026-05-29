import { describe, it, expect } from 'vitest'
import { portalEventToFeedItem } from '@/utils/portalCalendar'

describe('portalEventToFeedItem', () => {
  it('全天單日事件', () => {
    const item = portalEventToFeedItem({
      id: 1, title: '校慶', event_date: '2026-05-19', is_all_day: true, event_type: 'activity',
    })
    expect(item).toMatchObject({
      layer: 'event', id: 1, title: '校慶',
      start: '2026-05-19', end: '2026-05-19', all_day: true,
      color: '#67c23a', link: null,
    })
  })

  it('全天多日事件保持 end inclusive（由 toFullCalendarEvents 做 +1）', () => {
    const item = portalEventToFeedItem({
      id: 2, title: '連假', event_date: '2026-05-19', end_date: '2026-05-21', is_all_day: true,
    })
    expect(item.start).toBe('2026-05-19')
    expect(item.end).toBe('2026-05-21')
    expect(item.all_day).toBe(true)
  })

  it('時段事件合併 date + time 成 ISO datetime', () => {
    const item = portalEventToFeedItem({
      id: 3, title: '會議', event_date: '2026-05-19',
      is_all_day: false, start_time: '09:30', end_time: '11:00', event_type: 'meeting',
    })
    expect(item.start).toBe('2026-05-19T09:30:00')
    expect(item.end).toBe('2026-05-19T11:00:00')
    expect(item.all_day).toBe(false)
    expect(item.color).toBe('#409eff')
  })

  it('時段事件缺 end_time 時 end 退回等於 start', () => {
    const item = portalEventToFeedItem({
      id: 4, title: '提醒', event_date: '2026-05-19', is_all_day: false, start_time: '08:00',
    })
    expect(item.start).toBe('2026-05-19T08:00:00')
    expect(item.end).toBe('2026-05-19T08:00:00')
  })

  it('is_all_day 為 undefined 時預設全天', () => {
    const item = portalEventToFeedItem({ id: 5, title: 'x', event_date: '2026-05-19' })
    expect(item.all_day).toBe(true)
    expect(item.start).toBe('2026-05-19')
  })

  it('holiday / makeup_workday 顏色', () => {
    expect(portalEventToFeedItem({ event_date: '2026-05-19', event_type: 'holiday' }).color).toBe('#e6a23c')
    expect(portalEventToFeedItem({ event_date: '2026-05-19', event_type: 'makeup_workday' }).color).toBe('#8b5cf6')
  })
})
