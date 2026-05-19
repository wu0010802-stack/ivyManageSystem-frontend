/**
 * 管理端 CalendarView layer toggle 常數。
 *
 * 與後端 `ivy-backend/utils/calendar_colors.py` 同步：
 * - 後端 item.color 為主要顯示色（覆蓋以下 fallback）
 * - 本檔 LAYER_COLORS 僅供 UI 元件（chip 圖示等）在後端 item 尚未抵達時的 fallback
 */
import type { CalendarLayer } from '@/api/calendar'

export const CALENDAR_LAYERS: readonly CalendarLayer[] = [
  'event',
  'holiday',
  'leave',
  'activity',
  'appraisal',
  'meeting',
] as const

export const LAYER_LABELS: Record<CalendarLayer, string> = {
  event: '行事曆',
  holiday: '假日',
  leave: '請假',
  activity: '才藝課',
  appraisal: '考核',
  meeting: '會議',
}

export const LAYER_COLORS: Record<CalendarLayer, string> = {
  event: '#10b981',
  holiday: '#f59e0b',
  leave: '#0ea5e9',
  activity: '#ec4899',
  appraisal: '#dc2626',
  meeting: '#8b5cf6',
}
