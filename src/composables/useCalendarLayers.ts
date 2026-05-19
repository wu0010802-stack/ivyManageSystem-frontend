import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { CALENDAR_LAYERS } from '@/constants/calendarLayers'
import type { CalendarLayer, CalendarFeedItem } from '@/api/calendar'

const STORAGE_KEY = 'calendar.enabledLayers'

function loadEnabled(): Set<CalendarLayer> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
  toggle: (layer: CalendarLayer) => void
  enableAll: () => void
  disableAll: () => void
  setItems: (xs: CalendarFeedItem[]) => void
}

export function useCalendarLayers(): UseCalendarLayersReturn {
  const enabledLayers = ref<Set<CalendarLayer>>(loadEnabled())
  const items = ref<CalendarFeedItem[]>([])

  watch(
    enabledLayers,
    (s) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
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
      ;(map[it.start] ??= []).push(it)
    }
    return map
  })

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
    toggle,
    enableAll,
    disableAll,
    setItems,
  }
}
