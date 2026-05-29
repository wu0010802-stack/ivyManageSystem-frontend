<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import { getCalendar } from '@/api/portal'
import { apiError } from '@/utils/error'
import { toFullCalendarEvents } from '@/composables/useCalendarLayers'
import { portalEventToFeedItem, type PortalCalendarEvent } from '@/utils/portalCalendar'
import { EVENT_TYPES } from '@/constants/calendarEventTypes'
import CalendarBoard from '@/components/calendar/CalendarBoard.vue'
import CalendarEventDetailDialog from '@/components/calendar/CalendarEventDetailDialog.vue'
import type { CalendarEventDetail } from '@/components/calendar/types'

interface OfficialSync { warning?: string; [key: string]: unknown }

const loading = ref(false)
const officialSync = ref<OfficialSync | null>(null)

// 月份快取 "YYYY-MM" → 該月事件，避免切視圖/月份重複抓取。
// 同一 session 內不 invalidate（唯讀教師端可接受；需要最新資料時重整頁面）。
const monthCache = new Map<string, PortalCalendarEvent[]>()
// 目前可見範圍涵蓋月份的事件（合併去重後）
const events = ref<PortalCalendarEvent[]>([])

const officialSyncAlertType = computed(() => (officialSync.value?.warning ? 'warning' : 'info'))
const officialSyncMessage = computed(() =>
  officialSync.value?.warning
    ? officialSync.value.warning
    : '此行事曆與後台同步，包含校內事件、國定假日與補班日。',
)

const fcEvents = computed<EventInput[]>(() =>
  toFullCalendarEvents(events.value.map(portalEventToFeedItem)),
)

// 與 portalEventToFeedItem 的 id fallback 完全對齊（真實事件都有 id，此為防呆）
const evKey = (ev: PortalCalendarEvent): string | number =>
  ev.id ?? `${ev.event_date ?? ''}-${ev.title ?? ''}`

const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

// 取 [start, end] 範圍涵蓋的所有 (year, month)（end 取 activeEnd，可能小幅多含一月，無害且有快取）
function monthsInRange(start: Date, end: Date): Array<{ y: number; m: number }> {
  const out: Array<{ y: number; m: number }> = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    out.push({ y: cur.getFullYear(), m: cur.getMonth() + 1 })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

async function fetchMonth(y: number, m: number): Promise<void> {
  const key = monthKey(y, m)
  if (monthCache.has(key)) return
  const res = await getCalendar({ year: y, month: m })
  const data = res.data as { events?: PortalCalendarEvent[]; official_sync?: OfficialSync }
  monthCache.set(key, data.events || [])
  if (data.official_sync !== undefined) officialSync.value = data.official_sync
}

function rebuildEvents(months: Array<{ y: number; m: number }>): void {
  const seen = new Set<string | number>()
  const merged: PortalCalendarEvent[] = []
  for (const { y, m } of months) {
    for (const ev of monthCache.get(monthKey(y, m)) || []) {
      const k = evKey(ev)
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(ev)
    }
  }
  events.value = merged
}

async function onDatesSet(arg: DatesSetArg): Promise<void> {
  loading.value = true
  try {
    const months = monthsInRange(arg.view.activeStart, arg.view.activeEnd)
    await Promise.all(months.map((mm) => fetchMonth(mm.y, mm.m)))
    rebuildEvents(months)
  } catch (error) {
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

// 詳情
const detailVisible = ref(false)
const selectedEvent = ref<CalendarEventDetail | null>(null)

function onEventClick(arg: EventClickArg): void {
  const rawId = arg.event.extendedProps.rawId
  const ev = events.value.find((e) => evKey(e) === rawId)
  if (ev) {
    selectedEvent.value = ev
    detailVisible.value = true
  }
}
</script>

<template>
  <div class="portal-calendar" v-loading="loading">
    <el-alert
      :title="officialSyncMessage"
      :type="officialSyncAlertType"
      :closable="false"
      show-icon
      class="sync-alert"
    />

    <CalendarBoard
      :events="fcEvents"
      @event-click="onEventClick"
      @dates-set="onDatesSet"
    />

    <!-- Legend -->
    <div class="legend">
      <span v-for="t in EVENT_TYPES" :key="t.value" class="legend-item">
        <span class="legend-dot" :style="{ backgroundColor: t.color }"></span>
        {{ t.label }}
      </span>
    </div>

    <CalendarEventDetailDialog v-model="detailVisible" :event="selectedEvent" />
  </div>
</template>

<style scoped>
.portal-calendar {
  padding: 10px;
}

.sync-alert {
  margin-bottom: var(--space-4);
}

.legend {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-3);
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
