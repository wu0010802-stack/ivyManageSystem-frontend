import api from './index'

export const getEvents = (params) => api.get('/events', { params })

export const createEvent = (data) => api.post('/events', data)

export const updateEvent = (id, data) => api.put(`/events/${id}`, data)

export const deleteEvent = (id) => api.delete(`/events/${id}`)

// 假日批次匯入
export const getHolidayImportTemplate = () =>
  api.get('/events/holidays/import-template', { responseType: 'blob' })

export const importHolidays = (formData) =>
  api.post('/events/holidays/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
