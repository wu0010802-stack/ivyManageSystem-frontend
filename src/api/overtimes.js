import api from './index'

export const getOvertimes = (params) => api.get('/overtimes', { params })

export const createOvertime = (data) => api.post('/overtimes', data)

export const updateOvertime = (id, data) => api.put(`/overtimes/${id}`, data)

export const approveOvertime = (id, approved) =>
  api.put(`/overtimes/${id}/approve?approved=${approved}`)
