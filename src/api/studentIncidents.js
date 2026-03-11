import api from './index'

// 管理端 API

export function getIncidents(params = {}) {
  return api.get('/student-incidents', { params })
}

export function createIncident(data) {
  return api.post('/student-incidents', data)
}

export function updateIncident(id, data) {
  return api.put(`/student-incidents/${id}`, data)
}

export function deleteIncident(id) {
  return api.delete(`/student-incidents/${id}`)
}

// Portal 教師端 API

export function getMyClassIncidents(params = {}) {
  return api.get('/portal/my-class-incidents', { params })
}

export function createPortalIncident(data) {
  return api.post('/portal/incidents', data)
}
