import type { AxiosResponse } from 'axios'
import api from './index'

export type CalendarLayer =
  | 'event'
  | 'holiday'
  | 'leave'
  | 'activity'
  | 'appraisal'
  | 'meeting'

export interface CalendarFeedItem {
  layer: CalendarLayer
  id: number | string
  title: string
  start: string // YYYY-MM-DD
  end: string
  all_day: boolean
  color: string
  link: string | null
  meta: Record<string, unknown>
}

export interface CalendarFeedResponse {
  from: string
  to: string
  items: CalendarFeedItem[]
}

/**
 * 取得管理端跨模組行事曆。
 * window (to - from) ≤ 90 天，超過後端回 422。
 * 留空 layers 為「全部 layer」。
 */
export function getAdminFeed(
  from: string,
  to: string,
  layers?: CalendarLayer[],
): Promise<AxiosResponse<CalendarFeedResponse>> {
  const params: Record<string, string> = { from, to }
  if (layers && layers.length > 0) {
    params.layers = layers.join(',')
  }
  return api.get<CalendarFeedResponse>('/calendar/admin_feed', { params })
}
