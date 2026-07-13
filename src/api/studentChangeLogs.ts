import api from './index'
import type { AxiosResp } from './_generated/typed'

export const getChangeLogOptions = (): AxiosResp<'/students/change-logs/options', 'get'> =>
  api.get('/students/change-logs/options')

export const getChangeLogsSummary = (params: unknown) =>
  api.get('/students/change-logs/summary', { params })

export const getChangeLogs = (params: unknown) =>
  api.get('/students/change-logs', { params })

export const createChangeLog = (data: unknown) => api.post('/students/change-logs', data)

export const updateChangeLog = (id: number, data: unknown) =>
  api.put(`/students/change-logs/${id}`, data)

export const deleteChangeLog = (id: number) => api.delete(`/students/change-logs/${id}`)

export const exportChangeLogs = (params: unknown) =>
  api.get('/students/change-logs/export', { params, responseType: 'blob' })
