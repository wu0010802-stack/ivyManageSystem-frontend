import api from './index'

// --- Disability Documents (Phase 1) ---
export const listDisabilityDocs = (studentId) =>
  api.get('/gov-moe/disability-documents', { params: { student_id: studentId } })

export const createDisabilityDoc = (payload) =>
  api.post('/gov-moe/disability-documents', payload)

export const updateDisabilityDoc = (id, payload) =>
  api.put(`/gov-moe/disability-documents/${id}`, payload)

export const deleteDisabilityDoc = (id) =>
  api.delete(`/gov-moe/disability-documents/${id}`)

// --- Dashboard Widget (Phase 1) ---
export const getDisabilityExpiryWidget = (days = 30) =>
  api.get('/gov-moe/dashboard/disability-expiry', { params: { days } })

// --- Enrollment Certificates (Phase 4C) ---
export const generateCertificate = (studentId, payload) =>
  api.post(`/gov-moe/certificates/${studentId}/generate`, payload)

export const listCertificateHistory = (params = {}) =>
  api.get('/gov-moe/certificates/history', { params })

// --- Special Subsidies (Phase 4B) ---
export const listSubsidies = (params = {}) =>
  api.get('/gov-moe/subsidies', { params })
export const createSubsidy = (payload) =>
  api.post('/gov-moe/subsidies', payload)
export const updateSubsidy = (id, payload) =>
  api.put(`/gov-moe/subsidies/${id}`, payload)
export const submitSubsidy = (id) =>
  api.put(`/gov-moe/subsidies/${id}/submit`)
export const approveSubsidy = (id, payload) =>
  api.put(`/gov-moe/subsidies/${id}/approve`, payload)
export const markSubsidyPaid = (id, payload) =>
  api.put(`/gov-moe/subsidies/${id}/mark_paid`, payload)
export const rejectSubsidy = (id) =>
  api.put(`/gov-moe/subsidies/${id}/reject`)
export const exportSubsidies = (params) =>
  api.get('/gov-moe/subsidies/export', { params, responseType: 'blob' })
