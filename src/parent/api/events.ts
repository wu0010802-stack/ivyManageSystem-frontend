import api from './index'

export const listEvents = () => api.get('/parent/events')

export const acknowledgeEvent = (eventId: number, payload: unknown) =>
  api.post(`/parent/events/${eventId}/ack`, payload)
