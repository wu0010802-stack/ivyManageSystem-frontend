import api from './index'

export const getWeekAgenda = (days = 7) =>
  api.get('/parent/calendar/week', { params: { days } })

/**
 * 整月行程（[year-month-01, 隔月-01)）。
 * 與 week 共用後端 `_aggregate_period`，items 形狀相同，渲染可直接複用。
 */
export const getMonthAgenda = (year: number, month: number) =>
  api.get('/parent/calendar/month', { params: { year, month } })
