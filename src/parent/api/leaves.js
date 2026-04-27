import api from './index'

export const createLeave = (payload) => api.post('/parent/student-leaves', payload)

export const listLeaves = () => api.get('/parent/student-leaves')

export const getLeave = (id) => api.get(`/parent/student-leaves/${id}`)

export const cancelLeave = (id) =>
  api.post(`/parent/student-leaves/${id}/cancel`)
