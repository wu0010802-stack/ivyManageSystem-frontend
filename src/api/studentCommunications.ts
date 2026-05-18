import api from './index'

export const getCommunicationOptions = () =>
  api.get('/students/communications/options')

export const getCommunications = (params: unknown) =>
  api.get('/students/communications', { params })

export const createCommunication = (data: unknown) =>
  api.post('/students/communications', data)

export const updateCommunication = (id: number, data: unknown) =>
  api.put(`/students/communications/${id}`, data)

export const deleteCommunication = (id: number) =>
  api.delete(`/students/communications/${id}`)
