import api from './index'
import type { AxiosProgressEvent } from 'axios'

// ============ Observations ============
export const listObservations = (studentId: number, params: unknown = {}) =>
  api.get(`/students/${studentId}/observations`, { params })

export const createObservation = (studentId: number, data: unknown) =>
  api.post(`/students/${studentId}/observations`, data)

export const updateObservation = (studentId: number, obsId: number, data: unknown) =>
  api.patch(`/students/${studentId}/observations/${obsId}`, data)

export const deleteObservation = (studentId: number, obsId: number) =>
  api.delete(`/students/${studentId}/observations/${obsId}`)

// ============ Attachments ============
export const uploadAttachment = (
  file: File,
  ownerType: string,
  ownerId: number,
  { onUploadProgress }: { onUploadProgress?: (e: AxiosProgressEvent) => void } = {},
) => {
  const form = new FormData()
  form.append('file', file)
  form.append('owner_type', ownerType)
  form.append('owner_id', String(ownerId))
  return api.post('/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  })
}

export const deleteAttachment = (attachmentId: number) =>
  api.delete(`/attachments/${attachmentId}`)
