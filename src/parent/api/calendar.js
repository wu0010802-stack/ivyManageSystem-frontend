import api from './index'

export const getWeekAgenda = (days = 7) =>
  api.get('/parent/calendar/week', { params: { days } })
