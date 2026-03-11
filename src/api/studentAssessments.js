import api from './index'

export function getAssessments(params = {}) {
  return api.get('/student-assessments', { params })
}

export function createAssessment(data) {
  return api.post('/student-assessments', data)
}

export function updateAssessment(id, data) {
  return api.put(`/student-assessments/${id}`, data)
}

export function deleteAssessment(id) {
  return api.delete(`/student-assessments/${id}`)
}

export function getMyClassAssessments(params = {}) {
  return api.get('/portal/my-class-assessments', { params })
}

export function createPortalAssessment(data) {
  return api.post('/portal/assessments', data)
}
