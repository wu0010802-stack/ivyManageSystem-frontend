import api from './index'

// ----- 班級相簿（教師端） -----
export const listAlbums = () => api.get('/portal/class-albums')
export const getAlbumClassrooms = () => api.get('/portal/class-albums/my-classrooms')
export const createAlbum = (data: { classroom_id: number; title: string; event_date: string; description?: string }) =>
  api.post('/portal/class-albums', data)
export const getAlbum = (albumId: number) => api.get(`/portal/class-albums/${albumId}`)
export const updateAlbum = (albumId: number, data: { title?: string; description?: string; event_date?: string }) =>
  api.patch(`/portal/class-albums/${albumId}`, data)
export const deleteAlbum = (albumId: number) => api.delete(`/portal/class-albums/${albumId}`)
export const uploadAlbumPhotos = (albumId: number, formData: FormData) =>
  api.post(`/portal/class-albums/${albumId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
export const deleteAlbumPhoto = (albumId: number, attachmentId: number) =>
  api.delete(`/portal/class-albums/${albumId}/photos/${attachmentId}`)
export const setPhotoTags = (albumId: number, items: Array<{ attachment_id: number; student_ids: number[] }>) =>
  api.put(`/portal/class-albums/${albumId}/photos/tags`, { items })
export const publishAlbum = (albumId: number) => api.post(`/portal/class-albums/${albumId}/publish`)
