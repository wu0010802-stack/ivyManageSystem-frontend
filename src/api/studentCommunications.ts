import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

export const getCommunicationOptions = () =>
  api.get('/students/communications/options')

export const getCommunications = (
  params: ApiQuery<'/students/communications', 'get'>,
): AxiosResp<'/students/communications', 'get'> =>
  api.get('/students/communications', { params })

export const createCommunication = (data: unknown) =>
  api.post('/students/communications', data)

export const updateCommunication = (id: number, data: unknown) =>
  api.put(`/students/communications/${id}`, data)

export const deleteCommunication = (id: number) =>
  api.delete(`/students/communications/${id}`)
