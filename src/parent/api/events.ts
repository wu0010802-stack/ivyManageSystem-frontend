import api from './index'
import type { AxiosRequestConfig } from 'axios'

export const listEvents = () => api.get('/parent/events')

export const acknowledgeEvent = (eventId: number, payload: unknown, config?: AxiosRequestConfig) =>
  api.post(`/parent/events/${eventId}/ack`, payload, config)
