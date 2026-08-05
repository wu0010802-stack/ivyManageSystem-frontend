import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import type { EventInput } from '@fullcalendar/core'
import { CALENDAR_LAYERS } from '@/constants/calendarLayers'
import type { CalendarLayer, CalendarFeedItem } from '@/api/calendar'
// 多租戶：UI 偏好走 tenantStorage wrapper（單租戶模式 key 與改造前逐字相同，DEV-12）。
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'

const STORAGE_KEY = 'calendar.enabledLayers'

function loadEnabled(): Set<CalendarLayer> {
  try {
    const raw = tenantGetItem(STORAGE_KEY)
    if (!raw) return new Set(CALENDAR_LAYERS)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(CALENDAR_LAYERS)
    const valid = parsed.filter((x): x is CalendarLayer =>
      typeof x === 'string' && (CALENDAR_LAYERS as readonly string[]).includes(x),
    )
    return new Set(valid)
  } catch {
    return new Set(CALENDAR_LAYERS)
  }
}

export interface UseCalendarLayersReturn {
  enabledLayers: Ref<Set<CalendarLayer>>
  items: Ref<CalendarFeedItem[]>
  filteredItems: ComputedRef<CalendarFeedItem[]>
  groupByDate: ComputedRef<Record<string, CalendarFeedItem[]>>
  fullCalendarEvents: ComputedRef<EventInput[]>
  toggle: (layer: CalendarLayer) => void
  enableAll: () => void
  disableAll: () => void
  setItems: (xs: CalendarFeedItem[]) => void
}

/**
 * 把 admin_feed CalendarFeedItem 轉成 FullCalendar EventInput。
 *
 * FullCalendar 慣例：
 * - all-day 多日：end 為 exclusive（顯示 5/19~5/20 兩天需 end=5/21）— 補一天
 * - all-day 單日：省 end
 * - 時段事件：BE 已送 ISO datetime，end 維持 inclusive 不動
 * - editable：僅 layer='event' 可拖（其他 layer 由 BE 權限/政策限制）
 *
 * item.id 可能是 int（單次事件）或 string `{pk}@{date}`（Phase C 重複事件展開）。
 * 為避免不同 layer id 撞，FC 用 `{layer}:{id}` 作 unique key。
 */
export function toFullCalendarEvents(items: CalendarFeedItem[]): EventInput[] {
  return items.map((it) => {
    const isAllDay = it.all_day
    let endValue: string | undefined
    if (isAllDay) {
      if (it.start === it.end) {
        endValue = undefined
      } else {
        const d = new Date(`${it.end}T00:00:00`)
        d.setDate(d.getDate() + 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        endValue = `${y}-${m}-${day}`
      }
    } else {
      endValue = it.end
    }
    return {
      id: `${it.layer}:${it.id}`,
      title: it.title,
      start: it.start,
      end: endValue,
      allDay: isAllDay,
      backgroundColor: it.color,
      borderColor: it.color,
      editable: it.layer === 'event',
      extendedProps: {
        layer: it.layer,
        link: it.link,
        meta: it.meta,
        rawId: it.id,
      },
    }
  })
}

/**
 * 唯讀強制：FullCalendar per-event editable:true 會蓋過全域 editable:false。
 * 唯讀模式（editable=false）需逐 event 強制 editable:false，不能只靠全域旗標。
 * editable=true 時原樣返回，保留 toFullCalendarEvents 設定的 per-layer editable。
 */
export function applyEditable(events: EventInput[], editable: boolean): EventInput[] {
  if (editable) return events
  return events.map((e) => ({ ...e, editable: false }))
}

export function useCalendarLayers(): UseCalendarLayersReturn {
  const enabledLayers = ref<Set<CalendarLayer>>(loadEnabled())
  const items = ref<CalendarFeedItem[]>([])

  watch(
    enabledLayers,
    (s) => {
      try {
        tenantSetItem(STORAGE_KEY, JSON.stringify([...s]))
      } catch {
        /* localStorage 滿了不影響邏輯 */
      }
    },
    { deep: true },
  )

  const filteredItems = computed(() =>
    items.value.filter((it) => enabledLayers.value.has(it.layer)),
  )

  const groupByDate = computed(() => {
    const map: Record<string, CalendarFeedItem[]> = {}
    for (const it of filteredItems.value) {
      // it.start 可能是 "YYYY-MM-DD" 或 "YYYY-MM-DDTHH:MM:SS"；
      // groupByDate 用日期部分當 key（取前 10 字元）。
      const dateKey = typeof it.start === 'string' ? it.start.slice(0, 10) : it.start
      ;(map[dateKey] ??= []).push(it)
    }
    return map
  })

  const fullCalendarEvents = computed(() => toFullCalendarEvents(filteredItems.value))

  function toggle(layer: CalendarLayer) {
    const next = new Set(enabledLayers.value)
    if (next.has(layer)) next.delete(layer)
    else next.add(layer)
    enabledLayers.value = next
  }

  function enableAll() {
    enabledLayers.value = new Set(CALENDAR_LAYERS)
  }

  function disableAll() {
    enabledLayers.value = new Set()
  }

  function setItems(xs: CalendarFeedItem[]) {
    items.value = xs
  }

  return {
    enabledLayers,
    items,
    filteredItems,
    groupByDate,
    fullCalendarEvents,
    toggle,
    enableAll,
    disableAll,
    setItems,
  }
}
