import api from './index'

export const getEvents = (params: unknown) => api.get('/events', { params })

export const getCalendarFeed = (params: unknown) => api.get('/events/calendar-feed', { params })

export const createEvent = (data: unknown) => api.post('/events', data)

export const updateEvent = (id: number, data: unknown) => api.put(`/events/${id}`, data)

export const deleteEvent = (id: number) => api.delete(`/events/${id}`)

// 假日批次匯入
export const getHolidayImportTemplate = () =>
  api.get('/events/holidays/import-template', { responseType: 'blob' })

export const importHolidays = (formData: FormData) =>
  api.post('/events/holidays/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
