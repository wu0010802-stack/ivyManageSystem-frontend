import api from './index'

// 管理端 API

export function getIncidents(params: unknown = {}) {
  return api.get('/student-incidents', { params })
}

export function createIncident(data: unknown) {
  return api.post('/student-incidents', data)
}

export function updateIncident(id: number, data: unknown) {
  return api.put(`/student-incidents/${id}`, data)
}

export function deleteIncident(id: number) {
  return api.delete(`/student-incidents/${id}`)
}

// Portal 教師端 API

export function getMyClassIncidents(params: unknown = {}) {
  return api.get('/portal/my-class-incidents', { params })
}

export function createPortalIncident(data: unknown) {
  return api.post('/portal/incidents', data)
}
