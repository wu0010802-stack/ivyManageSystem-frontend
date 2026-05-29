import type { CalendarFeedItem } from '@/api/calendar'
import { eventTypeColor } from '@/constants/calendarEventTypes'

/** portal getCalendar 回傳的單筆事件（與後台 events/calendar-feed 同形狀）。 */
export interface PortalCalendarEvent {
  id?: number
  title?: string
  event_date?: string
  end_date?: string | null
  event_type?: string
  event_type_label?: string
  is_all_day?: boolean
  start_time?: string | null
  end_time?: string | null
  location?: string | null
  description?: string | null
  is_official?: boolean
  [key: string]: unknown
}

/**
 * 把 portal CalendarEvent 轉成 CalendarFeedItem（layer 一律 'event'），
 * 之後交給既有 toFullCalendarEvents 做 FullCalendar 日期轉換。
 *
 * 刻意「不」在此重做日期魔法（全天多日 +1 exclusive）— 那是 toFullCalendarEvents
 * 的單一責任，避免邏輯漂移（spec「以後台為準」防漂移核心）。
 * - 全天：start/end 維持 inclusive 日期字串（end 缺省回退 start）。
 * - 時段：合併 event_date + start_time/end_time 成 ISO datetime（end 缺則等於 start，
 *   與 toFullCalendarEvents 對時段事件 end inclusive 的慣例一致）。
 */
export function portalEventToFeedItem(ev: PortalCalendarEvent): CalendarFeedItem {
  const allDay = ev.is_all_day !== false // undefined 視為全天（與既有 portal 行為一致）
  const date = ev.event_date ?? ''
  let start: string
  let end: string
  if (allDay) {
    start = date
    end = ev.end_date || date
  } else {
    start = ev.start_time ? `${date}T${ev.start_time}:00` : date
    end = ev.end_time ? `${date}T${ev.end_time}:00` : start
  }
  return {
    layer: 'event',
    id: ev.id ?? `${date}-${ev.title ?? ''}`,
    title: ev.title ?? '',
    start,
    end,
    all_day: allDay,
    color: eventTypeColor(ev.event_type),
    link: null,
    meta: {},
  }
}
