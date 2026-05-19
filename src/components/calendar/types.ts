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
