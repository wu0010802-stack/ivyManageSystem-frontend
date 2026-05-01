import api from './index'

export const createLeave = (payload) => api.post('/parent/student-leaves', payload)

export const listLeaves = () => api.get('/parent/student-leaves')

export const getLeave = (id) => api.get(`/parent/student-leaves/${id}`)

export const cancelLeave = (id) =>
  api.post(`/parent/student-leaves/${id}/cancel`)

export function uploadLeaveAttachment(leaveId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/parent/student-leaves/${leaveId}/attachments`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteLeaveAttachment(leaveId, attachmentId) {
  return api.delete(`/parent/student-leaves/${leaveId}/attachments/${attachmentId}`)
}
