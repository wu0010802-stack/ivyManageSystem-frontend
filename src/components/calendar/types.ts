export interface WeeklyRule {
  type: 'weekly'
  weekday: number
  until: string
}

export interface MonthlyDayRule {
  type: 'monthly_day'
  day: number
  until: string
}

export interface MonthlyNthRule {
  type: 'monthly_nth'
  nth: number
  weekday: number
  until: string
}

export type RecurrenceRule = WeeklyRule | MonthlyDayRule | MonthlyNthRule

/** 共用唯讀事件詳情 dialog 的顯示型別。 */
export interface CalendarEventDetail {
  title?: string
  event_type?: string
  event_type_label?: string
  event_date?: string
  end_date?: string | null
  is_all_day?: boolean
  start_time?: string | null
  end_time?: string | null
  location?: string | null
  description?: string | null
  is_official?: boolean
}
