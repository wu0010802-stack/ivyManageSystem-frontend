import api from './index'

export function getAssessments(params: unknown = {}) {
  return api.get('/student-assessments', { params })
}

export function createAssessment(data: unknown) {
  return api.post('/student-assessments', data)
}

export function updateAssessment(id: number, data: unknown) {
  return api.put(`/student-assessments/${id}`, data)
}

export function deleteAssessment(id: number) {
  return api.delete(`/student-assessments/${id}`)
}

export function getMyClassAssessments(params: unknown = {}) {
  return api.get('/portal/my-class-assessments', { params })
}

export function createPortalAssessment(data: unknown) {
  return api.post('/portal/assessments', data)
}
