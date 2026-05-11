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
