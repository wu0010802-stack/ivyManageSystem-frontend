import api from './index'

export const getChangeLogOptions = () => api.get('/students/change-logs/options')

export const getChangeLogsSummary = (params) =>
  api.get('/students/change-logs/summary', { params })

export const getChangeLogs = (params) =>
  api.get('/students/change-logs', { params })

export const createChangeLog = (data) => api.post('/students/change-logs', data)

export const updateChangeLog = (id, data) =>
  api.put(`/students/change-logs/${id}`, data)

export const deleteChangeLog = (id) => api.delete(`/students/change-logs/${id}`)

export const exportChangeLogs = (params) =>
  api.get('/students/change-logs/export', { params, responseType: 'blob' })
