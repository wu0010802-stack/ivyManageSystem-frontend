/**
 * 行事曆事件類型常數（meeting/activity/holiday/makeup_workday/general）。
 * 後台 CalendarView、教師端 PortalCalendarView 與 portalEventToFeedItem 共用，
 * 避免顏色/標籤多處重複。
 *
 * 注意：此 taxonomy（事件 event_type）與 calendarLayers.ts 的 LAYER_*（跨模組 layer）
 * 是不同概念，勿混用。
 */
export interface EventTypeDef {
  value: string
  label: string
  color: string
}

export const EVENT_TYPES: readonly EventTypeDef[] = [
  { value: 'meeting', label: '會議', color: '#409eff' },
  { value: 'activity', label: '活動', color: '#67c23a' },
  { value: 'holiday', label: '國定假日', color: '#e6a23c' },
  { value: 'makeup_workday', label: '補班日', color: '#8b5cf6' },
  { value: 'general', label: '一般', color: '#909399' },
]

const EVENT_TYPE_MAP: Record<string, EventTypeDef> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t]),
)

export function eventTypeDef(type: string | undefined): EventTypeDef | undefined {
  return type ? EVENT_TYPE_MAP[type] : undefined
}

/** 取事件類型顏色；未知/缺省回退灰色（與 general 同色）。 */
export function eventTypeColor(type: string | undefined): string {
  return eventTypeDef(type)?.color ?? '#909399'
}
