import api from './index'
import type { AxiosRequestConfig } from 'axios'

export const createLeave = (payload: unknown, config?: AxiosRequestConfig) => api.post('/parent/student-leaves', payload, config)

export const listLeaves = () => api.get('/parent/student-leaves')

export const getLeave = (id: number) => api.get(`/parent/student-leaves/${id}`)

export const cancelLeave = (id: number) =>
  api.post(`/parent/student-leaves/${id}/cancel`)

export function uploadLeaveAttachment(leaveId: number, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/parent/student-leaves/${leaveId}/attachments`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteLeaveAttachment(leaveId: number, attachmentId: number) {
  return api.delete(`/parent/student-leaves/${leaveId}/attachments/${attachmentId}`)
}
