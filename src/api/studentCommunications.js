import api from './index'

export const getCommunicationOptions = () =>
  api.get('/students/communications/options')

export const getCommunications = (params) =>
  api.get('/students/communications', { params })

export const createCommunication = (data) =>
  api.post('/students/communications', data)

export const updateCommunication = (id, data) =>
  api.put(`/students/communications/${id}`, data)

export const deleteCommunication = (id) =>
  api.delete(`/students/communications/${id}`)
