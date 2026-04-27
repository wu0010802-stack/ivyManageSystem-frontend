import api from './index'

export const listEvents = () => api.get('/parent/events')

export const acknowledgeEvent = (eventId, payload) =>
  api.post(`/parent/events/${eventId}/ack`, payload)
