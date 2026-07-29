import api from './index'
import type { AxiosResponse } from 'axios'

// ----- 班級相簿（教師端） -----
// 後端尚未標 response_model → 手動描形（對齊 api/portal/class_albums.py）
export interface AlbumSummary {
  id: number
  classroom_id: number
  title: string
  description: string | null
  event_date: string
  status: 'draft' | 'published'
  published_at: string | null
  photo_count: number
  untagged_count: number
  cover_thumb_url: string | null
}

export interface AlbumClassroomOption {
  id: number
  name: string
}

export const listAlbums = () =>
  api.get('/portal/class-albums') as Promise<AxiosResponse<AlbumSummary[]>> // TODO(ts-strict): waiting on backend response_model
export const getAlbumClassrooms = () =>
  api.get('/portal/class-albums/my-classrooms') as Promise<AxiosResponse<AlbumClassroomOption[]>> // TODO(ts-strict): waiting on backend response_model
export const createAlbum = (data: { classroom_id: number; title: string; event_date: string; description?: string }) =>
  api.post('/portal/class-albums', data) as Promise<AxiosResponse<AlbumSummary>> // TODO(ts-strict): waiting on backend response_model
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
