import api from './index'

// ============ Observations ============
export const listObservations = (studentId, params = {}) =>
  api.get(`/students/${studentId}/observations`, { params })

export const createObservation = (studentId, data) =>
  api.post(`/students/${studentId}/observations`, data)

export const updateObservation = (studentId, obsId, data) =>
  api.patch(`/students/${studentId}/observations/${obsId}`, data)

export const deleteObservation = (studentId, obsId) =>
  api.delete(`/students/${studentId}/observations/${obsId}`)

// ============ Attachments ============
export const uploadAttachment = (file, ownerType, ownerId, { onUploadProgress } = {}) => {
  const form = new FormData()
  form.append('file', file)
  form.append('owner_type', ownerType)
  form.append('owner_id', String(ownerId))
  return api.post('/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  })
}

export const deleteAttachment = (attachmentId) =>
  api.delete(`/attachments/${attachmentId}`)
